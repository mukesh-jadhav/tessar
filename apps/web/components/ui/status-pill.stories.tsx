import type { Meta, StoryObj } from "@storybook/react";

import { StatusPill } from "./status-pill";

const meta: Meta<typeof StatusPill> = {
  title: "M3/StatusPill",
  component: StatusPill,
  argTypes: {
    status: {
      control: "select",
      options: ["completed", "in_progress", "failed", "refunded"],
    },
  },
  args: { status: "completed" },
};
export default meta;

type Story = StoryObj<typeof StatusPill>;

export const Completed: Story = { args: { status: "completed" } };
export const InProgress: Story = { args: { status: "in_progress" } };
export const Failed: Story = { args: { status: "failed" } };
export const Refunded: Story = { args: { status: "refunded" } };

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusPill status="completed" />
      <StatusPill status="in_progress" />
      <StatusPill status="failed" />
      <StatusPill status="refunded" />
    </div>
  ),
};
