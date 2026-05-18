"""architect — fifth real node of the agent graph (Phase 3.8).

Tier-A. Strict JSON output validated against `Architecture`. Up to
three attempts: the first uses the normal prompt; attempts 2 and 3
append a comprehensive ADR-0006 admissibility checklist plus the
specific errors from the prior response. Attempt 3 also lowers
temperature to 0.1 and adds a self-consistency escape-hatch
("remove the offending element rather than leave inconsistency").
Two admissibility checks run beyond Pydantic:

1. **Citation grounding** — every `ArchNode.cite` (and every cite on
   edges/flows/integration_contract/component_rationales/failure_modes)
   must reference a supplied KB id or a returned `RQ-NN` finding;
   failed research questions are NOT evidence.
2. **Topology integrity** — every edge's `from`/`to` and every flow's
   `nodes[]` entry must reference a defined `node.id`; no self-loops;
   integration_contracts must match defined edges; failure_modes must
   cover every node with a non-empty failure_domain; build_sequence
   must reference defined node ids.

If attempt 3 still fails, `ArchitectureError` is raised and the runner
marks the run failed + refunds.

Public surface: ``architect(normalized, requirements, synthesis,
findings, kb_candidates, *, router) -> Architecture``.
"""

from __future__ import annotations

import json
import re
from importlib import resources

from pydantic import ValidationError

from tessar.kb import KbRecord
from tessar.llm import LlmMessage, LlmRouter
from tessar.llm.providers.base import OutputTruncatedError
from tessar.paths import repo_root as _repo_root
from tessar.schemas import (
    Architecture,
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    Synthesis,
)

AGENT_NAME = "architect"
PROMPT_VERSION = "v2"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)
_REQUIRED_SEQUENCE_KINDS = frozenset({"write", "read", "async"})

# Full ADR-0006 admissibility checklist used in retry directives. Empirically,
# narrow retry messages ("fix your citations") only nudge the model on the
# rules they enumerate; models that violate failure_modes/build_sequence/
# integration_contract rules on attempt 1 tend to repeat the same mistake
# on attempt 2 because the directive never reminded them of those rules.
_ADMISSIBILITY_CHECKLIST = (
    "ADR-0006 ADMISSIBILITY CHECKLIST \u2014 every one MUST hold:\n"
    "  1. Every node.cite, edge.cite, flow.cite, integration_contract[*].cite, "
    "component_rationales[*].cite, and failure_modes[*].cite MUST reference a "
    "supplied KB id (kind='kb') or an RQ-NN with a returned finding (kind='finding'). "
    "Failed research questions are NOT evidence.\n"
    "  2. Every edge.from/edge.to and every flow.nodes[*] entry MUST reference "
    "a defined node.id. No self-loops.\n"
    "  3. integration_contract[*] src\u2192to MUST match a defined edge pair.\n"
    "  4. component_rationales is non-empty; every entry references a defined "
    "node.id and a supplied requirement.id (FR-* or NFR-*).\n"
    "  5. failure_modes MUST include at least one entry per node that declares "
    "a non-empty failure_domain. Every node.id appearing in any node.failure_domain "
    "MUST also appear as a failure_modes[*].node_id. node.failure_domain entries "
    "must reference defined node ids and exclude the node itself.\n"
    "  6. build_sequence MUST have 3-6 phases; every phase.nodes[*] MUST "
    "reference a defined node.id.\n"
    "  7. Exactly 3 sequence_diagrams, one each of kind: write, read, async."
)


def _build_retry_message(
    prior_response_text: str,
    errors_text: str,
    *,
    final_attempt: bool,
) -> LlmMessage:
    """Build the user turn that follows a rejected attempt.

    `final_attempt` switches to FINAL framing and adds a self-consistency
    escape hatch: rather than leaving an admissibility hole, the model
    is instructed to remove the offending field (e.g. drop a node's
    `failure_domain` rather than leave a node uncovered by
    `failure_modes`).
    """
    header = (
        "FINAL ATTEMPT. The previous two responses were both rejected."
        if final_attempt
        else "Your previous response was rejected:"
    )
    footer = (
        "\n\nIf you cannot satisfy a rule, REMOVE the offending element rather "
        "than leave the output inconsistent (e.g. drop a node's failure_domain "
        "entries before omitting its failure_modes coverage). Self-consistency "
        "outranks completeness on this final attempt."
        if final_attempt
        else ""
    )
    content = (
        f"{header}\n\n"
        f"{errors_text}\n\n"
        "Output a corrected JSON object only. No prose, no fences.\n\n"
        f"{_ADMISSIBILITY_CHECKLIST}"
        f"{footer}"
    )
    return LlmMessage(role="user", content=content)


class ArchitectureError(RuntimeError):
    """Architect produced output that failed validation or admissibility twice."""

    def __init__(self, message: str, *, raw_text: str, validation_error: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text
        self.validation_error = validation_error


def _load_prompt() -> str:
    repo_root = _repo_root()
    prompt_path = repo_root / "packages" / "prompts" / AGENT_NAME / f"{PROMPT_VERSION}.md"
    if not prompt_path.is_file():
        try:
            return (
                resources.files("packages.prompts")
                .joinpath(f"{AGENT_NAME}/{PROMPT_VERSION}.md")
                .read_text(encoding="utf-8")
            )
        except (ModuleNotFoundError, FileNotFoundError) as e:
            raise FileNotFoundError(
                f"prompt not found at {prompt_path}; "
                f"check packages/prompts/{AGENT_NAME}/{PROMPT_VERSION}.md"
            ) from e
    return prompt_path.read_text(encoding="utf-8")


def _split_system_user(
    prompt_md: str,
    *,
    normalized_json: str,
    requirements_json: str,
    synthesis_json: str,
    findings_json: str,
    kb_json: str,
) -> list[LlmMessage]:
    parts = prompt_md.split("## User", 1)
    if len(parts) != 2:
        raise ValueError("prompt template missing '## User' section")
    system_block = parts[0].split("## System", 1)
    if len(system_block) != 2:
        raise ValueError("prompt template missing '## System' section")
    system_text = system_block[1].strip()
    user_text = (
        parts[1]
        .strip()
        .replace("{{NORMALIZED_BRIEF_JSON}}", normalized_json)
        .replace("{{REQUIREMENTS_JSON}}", requirements_json)
        .replace("{{SYNTHESIS_JSON}}", synthesis_json)
        .replace("{{FINDINGS_JSON}}", findings_json)
        .replace("{{KB_CANDIDATES_JSON}}", kb_json)
    )
    return [
        LlmMessage(role="system", content=system_text),
        LlmMessage(role="user", content=user_text),
    ]


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text).strip()


def _kb_to_prompt_dicts(kb_candidates: list[KbRecord]) -> list[dict]:
    """Same shape as `synthesizer._kb_to_prompt_dicts` — slim records to
    the fields the architect needs to wire + cite."""
    out: list[dict] = []
    for r in kb_candidates:
        out.append(
            {
                "id": r.id,
                "name": r.name,
                "category": r.category,
                "vendor": r.vendor,
                "cloud": r.cloud,
                "capabilities": list(r.capabilities),
                "compliance": list(r.compliance),
                "regions": list(r.regions),
            }
        )
    return out


def _admissibility_errors(
    arch: Architecture,
    *,
    kb_ids: set[str],
    finding_ids: set[str],
    requirement_ids: set[str],
) -> list[str]:
    """Return human-readable errors for ungrounded citations or broken
    topology. Empty list = clean output."""
    errors: list[str] = []
    node_ids = {n.id for n in arch.nodes}
    edge_pairs = {(e.src, e.to) for e in arch.edges}

    def _check_cite(label: str, kind: str, ref: str) -> None:
        if kind == "kb" and ref not in kb_ids:
            errors.append(f"{label} cites kb:{ref!r} but that KB id was not supplied")
        elif kind == "finding" and ref not in finding_ids:
            errors.append(f"{label} cites finding:{ref!r} but no such finding was returned")

    # 1. citation grounding (nodes)
    for n in arch.nodes:
        _check_cite(n.id, n.cite.kind, n.cite.ref)

    # 2. topology — edges
    for i, e in enumerate(arch.edges):
        if e.src not in node_ids:
            errors.append(f"edge[{i}] from={e.src!r} is not a defined node id")
        if e.to not in node_ids:
            errors.append(f"edge[{i}] to={e.to!r} is not a defined node id")
        if e.src == e.to:
            errors.append(f"edge[{i}] is a self-loop on {e.src!r}")

    # 3. topology — flows
    for f in arch.flows:
        for ref in f.nodes:
            if ref not in node_ids:
                errors.append(f"flow {f.id} references node {ref!r} which is not defined")

    # 4. failure_domain integrity (cheap belt-and-braces)
    for n in arch.nodes:
        for ref in n.failure_domain:
            if ref not in node_ids:
                errors.append(f"{n.id}.failure_domain references {ref!r} which is not a node")
            elif ref == n.id:
                errors.append(f"{n.id}.failure_domain includes itself")

    # 5. ADR-0006: sequence_diagrams must cover write/read/async
    if not arch.sequence_diagrams:
        errors.append("sequence_diagrams is empty (ADR-0006 requires write/read/async)")
    else:
        kinds_present = {sd.kind for sd in arch.sequence_diagrams}
        missing = _REQUIRED_SEQUENCE_KINDS - kinds_present
        if missing:
            errors.append(f"sequence_diagrams missing required kinds: {sorted(missing)}")
        seen_ids: set[str] = set()
        for sd in arch.sequence_diagrams:
            if sd.id in seen_ids:
                errors.append(f"sequence_diagrams has duplicate id {sd.id!r}")
            seen_ids.add(sd.id)
            expected_id = f"SEQ-{sd.kind}"
            if sd.id != expected_id:
                errors.append(
                    f"sequence_diagram id {sd.id!r} does not match kind (expected {expected_id!r})"
                )

    # 6. ADR-0006: integration_contracts must reference defined edges + cite
    if not arch.integration_contracts:
        errors.append("integration_contracts is empty (ADR-0006 requires ≥1)")
    else:
        for i, ic in enumerate(arch.integration_contracts):
            if ic.src not in node_ids:
                errors.append(f"integration_contract[{i}] from={ic.src!r} is not a defined node")
            if ic.to not in node_ids:
                errors.append(f"integration_contract[{i}] to={ic.to!r} is not a defined node")
            if (ic.src, ic.to) not in edge_pairs:
                errors.append(
                    f"integration_contract[{i}] {ic.src}->{ic.to} does not match any edge"
                )
            _check_cite(f"integration_contract[{i}]", ic.cite.kind, ic.cite.ref)

    # 7. ADR-0006: component_rationales must reference defined nodes + requirements + cite
    if not arch.component_rationales:
        errors.append("component_rationales is empty (ADR-0006 requires ≥1)")
    else:
        for i, cr in enumerate(arch.component_rationales):
            if cr.node_id not in node_ids:
                errors.append(
                    f"component_rationale[{i}] node_id={cr.node_id!r} is not a defined node"
                )
            if cr.requirement_id not in requirement_ids:
                errors.append(
                    f"component_rationale[{i}] requirement_id={cr.requirement_id!r} "
                    f"is not a supplied requirement id"
                )
            _check_cite(f"component_rationale[{i}]", cr.cite.kind, cr.cite.ref)

    # 8. ADR-0006: failure_modes — one per node with failure_domain.length>=1
    nodes_needing_fm = {n.id for n in arch.nodes if n.failure_domain}
    fm_node_ids: set[str] = set()
    seen_fm_ids: set[str] = set()
    for i, fm in enumerate(arch.failure_modes):
        if fm.id in seen_fm_ids:
            errors.append(f"failure_modes[{i}] duplicate id {fm.id!r}")
        seen_fm_ids.add(fm.id)
        if fm.node_id not in node_ids:
            errors.append(f"failure_modes[{i}] node_id={fm.node_id!r} is not a defined node")
        fm_node_ids.add(fm.node_id)
        _check_cite(f"failure_modes[{i}]", fm.cite.kind, fm.cite.ref)
    missing_fm = nodes_needing_fm - fm_node_ids
    if missing_fm:
        errors.append(
            f"failure_modes missing entries for nodes with failure_domain: {sorted(missing_fm)}"
        )

    # 9. ADR-0006: build_sequence — 3-6 phases, components reference node ids
    if len(arch.build_sequence) < 3:
        errors.append(
            f"build_sequence has {len(arch.build_sequence)} phases (ADR-0006 requires ≥3)"
        )
    seen_bp_ids: set[str] = set()
    for i, phase in enumerate(arch.build_sequence):
        if phase.id in seen_bp_ids:
            errors.append(f"build_sequence[{i}] duplicate id {phase.id!r}")
        seen_bp_ids.add(phase.id)
        for node_ref in phase.nodes:
            if node_ref not in node_ids:
                errors.append(f"build_sequence[{i}] node={node_ref!r} is not a defined node id")

    return errors


def _parse(text: str) -> Architecture:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return Architecture.model_validate(data)


def architect(
    normalized: NormalizedBrief,
    requirements: Requirements,
    synthesis: Synthesis,
    findings: ResearchFindings,
    kb_candidates: list[KbRecord],
    *,
    router: LlmRouter,
) -> Architecture:
    """Run the architect node.

    Up to three attempts. Attempt 1 = normal prompt. Attempt 2 = append
    rejection turn with full ADR-0006 admissibility checklist. Attempt 3
    = same checklist + FINAL-attempt framing + self-consistency escape
    hatch, at temperature 0.1. Three failures → `ArchitectureError`;
    runner marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    requirements_json = requirements.model_dump_json(exclude_none=False)
    synthesis_json = synthesis.model_dump_json(exclude_none=False)
    findings_json = findings.model_dump_json(exclude_none=False)
    kb_json = json.dumps(_kb_to_prompt_dicts(kb_candidates), separators=(",", ":"))

    messages = _split_system_user(
        prompt_md,
        normalized_json=normalized_json,
        requirements_json=requirements_json,
        synthesis_json=synthesis_json,
        findings_json=findings_json,
        kb_json=kb_json,
    )

    kb_ids = {r.id for r in kb_candidates}
    finding_ids = {f.question_id for f in findings.findings}
    requirement_ids = {r.id for r in requirements.functional} | {
        r.id for r in requirements.non_functional
    }

    # Architect output is the largest JSON in the graph (nodes + edges + flows
    # + per-node `why`/`alts`/`scale`). 16k was empirically too tight on rich
    # briefs (Vertex 2.5-pro returned `finish_reason=MAX_TOKENS` mid-string).
    # Start at 24k; if the provider still truncates, the catch below retries
    # at 2× budget on the same provider.
    initial_budget = 24000
    truncated_budget = 48000

    first_err: str | None = None
    response_text = ""
    truncated_first = False
    try:
        response = router.generate(
            messages, agent_name=AGENT_NAME, max_tokens=initial_budget, temperature=0.2
        )
        response_text = response.text
        arch = _parse(response.text)
        admissibility = _admissibility_errors(
            arch,
            kb_ids=kb_ids,
            finding_ids=finding_ids,
            requirement_ids=requirement_ids,
        )
        if not admissibility:
            return arch
        first_err = "Architecture rejected:\n- " + "\n- ".join(admissibility)
    except OutputTruncatedError as trunc:
        truncated_first = True
        first_err = str(trunc)
        response_text = trunc.partial_text
    except (ValidationError, json.JSONDecodeError) as e:
        first_err = str(e)
        # Treat unterminated-string parse failures as latent truncation —
        # the symptom of MAX_TOKENS when the SDK doesn't surface finish_reason.
        if "Unterminated string" in first_err or "Unexpected end" in first_err:
            truncated_first = True

    if truncated_first:
        # The model wasn't wrong about content — we just under-budgeted.
        # Re-issue the ORIGINAL prompt at the larger budget; do not append
        # a conversational "you were rejected" turn (it confuses the model
        # and wastes prompt tokens).
        retry_messages = list(messages)
        retry_budget = truncated_budget
    else:
        retry_messages = [
            *messages,
            LlmMessage(role="assistant", content=response_text or "<empty>"),
            _build_retry_message(response_text, first_err or "", final_attempt=False),
        ]
        retry_budget = initial_budget

    # --- Attempt 2 ----------------------------------------------------------
    try:
        retry = router.generate(
            retry_messages, agent_name=AGENT_NAME, max_tokens=retry_budget, temperature=0.2
        )
    except OutputTruncatedError as trunc:
        # Two truncations means budget, not content \u2014 a 3rd attempt won't
        # help. Bail with the existing terminal error.
        raise ArchitectureError(
            "architect produced output that exceeded max_output_tokens twice",
            raw_text=trunc.partial_text,
            validation_error=str(trunc),
        ) from trunc

    second_err: str | None = None
    second_response_text = retry.text
    arch_attempt2: Architecture | None = None
    try:
        arch_attempt2 = _parse(retry.text)
    except (ValidationError, json.JSONDecodeError) as parse_err:
        second_err = f"JSON/schema error: {parse_err}"

    if arch_attempt2 is not None:
        admissibility = _admissibility_errors(
            arch_attempt2,
            kb_ids=kb_ids,
            finding_ids=finding_ids,
            requirement_ids=requirement_ids,
        )
        if not admissibility:
            return arch_attempt2
        second_err = "Architecture rejected:\n- " + "\n- ".join(admissibility)

    # --- Attempt 3 (final) --------------------------------------------------
    # Same Tier-A model (architect is already at the frontier tier), but
    # lower temperature for determinism + comprehensive checklist + a
    # self-consistency escape hatch in the directive. This is the last
    # shot before the run fails and the user gets refunded.
    final_messages = [
        *messages,
        LlmMessage(role="assistant", content=response_text or "<empty>"),
        _build_retry_message(response_text, first_err or "", final_attempt=False),
        LlmMessage(role="assistant", content=second_response_text or "<empty>"),
        _build_retry_message(second_response_text, second_err or "", final_attempt=True),
    ]
    try:
        final = router.generate(
            final_messages, agent_name=AGENT_NAME, max_tokens=retry_budget, temperature=0.1
        )
    except OutputTruncatedError as trunc:
        raise ArchitectureError(
            "architect produced output that exceeded max_output_tokens on final attempt",
            raw_text=trunc.partial_text,
            validation_error=str(trunc),
        ) from trunc
    try:
        arch_final = _parse(final.text)
    except (ValidationError, json.JSONDecodeError) as final_parse_err:
        raise ArchitectureError(
            "architect produced invalid JSON three times",
            raw_text=final.text,
            validation_error=str(final_parse_err),
        ) from final_parse_err

    admissibility = _admissibility_errors(
        arch_final,
        kb_ids=kb_ids,
        finding_ids=finding_ids,
        requirement_ids=requirement_ids,
    )
    if admissibility:
        raise ArchitectureError(
            "architect produced ungrounded or topologically broken output three times",
            raw_text=final.text,
            validation_error="; ".join(admissibility),
        )
    return arch_final
