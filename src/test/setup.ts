import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { resetOfflineQueue } from "@/lib/offline/queue";

// The offline queue is shared by the whole app; each test starts with an empty one.
afterEach(() => resetOfflineQueue());
