import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "M3/Input",
  component: Input,
  args: { label: "Project name" },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const WithSupporting: Story = {
  args: { supporting: "Used as the run's display name." },
};
export const WithError: Story = {
  args: { error: "Required." },
};
export const Filled: Story = {
  args: { defaultValue: "Acme growth platform" },
};
