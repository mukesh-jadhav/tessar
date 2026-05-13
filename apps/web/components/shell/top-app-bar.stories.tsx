import type { Meta, StoryObj } from "@storybook/react";

import { TopAppBar, MarketingNav } from "./top-app-bar";
import { IconButton } from "@/components/ui/icon-button";

const meta: Meta<typeof TopAppBar> = {
  title: "Shell/TopAppBar",
  component: TopAppBar,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof TopAppBar>;

export const App: Story = {
  args: {
    title: "Run · Acme usage analytics",
    leading: <IconButton aria-label="Back" icon="arrow_back" variant="standard" />,
    trailing: (
      <>
        <IconButton aria-label="Share" icon="share" variant="standard" />
        <IconButton aria-label="More" icon="more_vert" variant="standard" />
      </>
    ),
  },
};

export const Marketing: StoryObj = {
  render: () => <MarketingNav />,
  parameters: { layout: "fullscreen" },
};
