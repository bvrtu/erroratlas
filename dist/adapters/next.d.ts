import type { RuntimeMonitor } from "../runtime.js";
import { type ProblemAdapterOptions } from "./shared.js";
export declare function withErrorAtlas<TArguments extends unknown[], TResult>(handler: (...args: TArguments) => Promise<TResult>, monitor: RuntimeMonitor, options?: ProblemAdapterOptions): (...args: TArguments) => Promise<TResult | Response>;
//# sourceMappingURL=next.d.ts.map