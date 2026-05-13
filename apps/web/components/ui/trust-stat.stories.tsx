import type { Meta, StoryObj } from "@storybook/react";

import { TrustStat } from "./trust-stat";

const meta: Meta<typeof TrustStat> = {
  title: "M3/TrustStat",
  component: TrustStat,
  args: { value: "$10", sub: "per run" },
};
export default meta;

type Story = StoryObj<typeof TrustStat>;

export const Default: Story = {};

export const ThreeUp: Story = {
  render: () => (
    <ul className="grid grid-cols-3 gap-2 w-[420px]">
      <TrustStat value="$10" sub="per run" />
      <TrustStat value="~12 min" sub="median run" />
      <TrustStat value="0" sub="lock-in" />
    </ul>
  ),
};
