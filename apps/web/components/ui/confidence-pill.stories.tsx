import type { Meta, StoryObj } from "@storybook/react";

import { ConfidencePill } from "./confidence-pill";

const meta: Meta<typeof ConfidencePill> = {
  title: "M3/ConfidencePill",
  component: ConfidencePill,
  argTypes: {
    conf: { control: "inline-radio", options: ["low", "med", "high"] },
  },
  args: { conf: "high" },
};
export default meta;

type Story = StoryObj<typeof ConfidencePill>;

export const High: Story = { args: { conf: "high" } };
export const Med: Story = { args: { conf: "med" } };
export const Low: Story = { args: { conf: "low" } };

export const Stack: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <ConfidencePill conf="high" />
      <ConfidencePill conf="med" />
      <ConfidencePill conf="low" />
    </div>
  ),
};
