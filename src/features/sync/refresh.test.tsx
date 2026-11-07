import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { liveTick } from "@/lib/live";
import { pullDistance, PULL_TRIGGER } from "./pull";
import { PullToRefresh } from "./PullToRefresh";

const touch = (type: string, y: number) =>
  fireEvent(window, Object.assign(new Event(type), { touches: type === "touchend" ? [] : [{ clientY: y }] }));

describe("pull-to-refresh", () => {
  afterEach(() => vi.useRealTimers());

  it("follows the finger at half speed, up to a limit", () => {
    expect(pullDistance(-30)).toBe(0);
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(1000)).toBe(110);
  });

  it("refreshes every screen when let go far enough down from the top", () => {
    vi.useFakeTimers();
    render(<PullToRefresh />);
    const before = liveTick(["transactions"]);

    touch("touchstart", 100);
    touch("touchmove", 100 + 2 * (PULL_TRIGGER - 20));
    expect(screen.getByText("Pull to refresh")).toBeInTheDocument();
    touch("touchmove", 100 + 2 * PULL_TRIGGER + 10);
    expect(screen.getByText("Release to refresh")).toBeInTheDocument();
    touch("touchend", 0);

    // Everything is announced: transactions and settings each move on.
    expect(liveTick(["transactions"])).toBe(before + 2);
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing…");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does nothing for a short pull or when the page is scrolled down", () => {
    render(<PullToRefresh />);
    const before = liveTick(["transactions"]);
    touch("touchstart", 100);
    touch("touchmove", 160);
    touch("touchend", 0);

    vi.spyOn(window, "scrollY", "get").mockReturnValue(400);
    touch("touchstart", 100);
    touch("touchmove", 600);
    touch("touchend", 0);
    vi.restoreAllMocks();

    expect(liveTick(["transactions"])).toBe(before);
    expect(screen.queryByText(/refresh/i)).toBeNull();
  });
});
