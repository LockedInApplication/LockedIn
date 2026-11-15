import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ConfirmDialog from "./ConfirmDialog";
it("provides clearly labelled safe and discard actions in an accessible dialog", () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      open
      title="Leave without saving?"
      description="Your changes will not be saved."
      confirmLabel="Leave without saving"
      cancelLabel="Keep editing"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain('role="alertdialog"');
  expect(html).toContain("aria-labelledby=");
  expect(html).toContain("aria-describedby=");
  expect(html).toContain("Keep editing");
  expect(html).toContain("Leave without saving");
});
