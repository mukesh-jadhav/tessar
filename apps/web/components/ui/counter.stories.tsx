import type { Meta, StoryObj } from "@storybook/react";

import { Counter } from "./counter";

const meta: Meta<typeof Counter> = {
  title: "M3/Counter",
  component: Counter,
  args: { label: "tokens", value: "12,400" },
};
export default meta;

type Story = StoryObj<typeof Counter>;

export const Default: Story = {};

export const Cost: Story = { args: { label: "cost", value: "$0.42" } };

export const InlineRow: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Counter label="tokens" value="12,400" />
      <Counter label="cost" value="$0.42" />
      <Counter label="sources" value="17" />
    </div>
  ),
};
