import type { Meta, StoryObj } from "@storybook/react";

import { WavyProgress } from "./wavy-progress";

const meta: Meta<typeof WavyProgress> = {
  title: "M3/WavyProgress",
  component: WavyProgress,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-96"><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof WavyProgress>;

export const Indeterminate: Story = {};
export const Determinate25: Story = { args: { value: 25 } };
export const Determinate62: Story = { args: { value: 62 } };
export const Complete: Story = { args: { value: 100 } };
