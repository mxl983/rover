import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemControls } from "./SystemControls.jsx";

describe("SystemControls", () => {
  it("returns null when not powered", () => {
    const { container } = render(
      <SystemControls
        isPowered={false}
        nvActive={false}
        resMode="720p"
        focusMode="far"
        isCapturing={false}
        quietMode={false}
        onQuietModeChange={vi.fn()}
        onNVToggle={vi.fn()}
        onResChange={vi.fn()}
        onFocusChange={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("opens menu when powered", async () => {
    const user = userEvent.setup();
    render(
      <SystemControls
        isPowered
        nvActive={false}
        resMode="720p"
        focusMode="far"
        isCapturing={false}
        quietMode={false}
        onQuietModeChange={vi.fn()}
        onNVToggle={vi.fn()}
        onResChange={vi.fn()}
        onFocusChange={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    const trigger = document.querySelector("[aria-haspopup='menu']");
    expect(trigger).toBeTruthy();
    await user.click(trigger);
    expect(document.body.textContent).toMatch(/Night|720|Focus|Quiet|Reboot|Shutdown/i);
  });
});
