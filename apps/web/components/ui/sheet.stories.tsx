import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Button } from "./button";
import { Sheet } from "./sheet";

const meta: Meta<typeof Sheet> = {
  title: "M3/Sheet",
  component: Sheet,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Sheet>;

function SheetDemo(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-[60vh] p-8">
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel="Demo sheet">
        <h3 className="text-xl font-semibold tracking-tight">Bottom sheet</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          Slides up on mobile, centers as a dialog on larger screens.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="text" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export const Default: Story = {
  render: () => <SheetDemo />,
};
