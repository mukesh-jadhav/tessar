import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Chip } from "./chip";

const meta: Meta<typeof Chip> = {
  title: "M3/Chip",
  component: Chip,
  args: { children: "GCP" },
  argTypes: {
    variant: { control: "select", options: ["assist", "filter", "input", "suggestion"] },
  },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Assist: Story = { args: { variant: "assist" } };

function FilterChipDemo(args: React.ComponentProps<typeof Chip>): React.ReactElement {
  const [on, setOn] = useState(false);
  return <Chip {...args} variant="filter" selected={on} onClick={() => setOn((v) => !v)} />;
}

export const Filter: Story = {
  render: (args) => <FilterChipDemo {...args} />,
};
export const Input: Story = { args: { variant: "input", trailingIcon: "close" } };
export const Suggestion: Story = { args: { variant: "suggestion", leadingIcon: "sparkles" } };
