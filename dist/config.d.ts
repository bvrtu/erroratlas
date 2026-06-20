import type { ErrorAtlasConfig, RawConfig } from "./types.js";
export declare const CONFIG_FILE = "erroratlas.config.json";
export declare function defaultRawConfig(): RawConfig;
export declare function loadConfig(root: string): Promise<ErrorAtlasConfig>;
//# sourceMappingURL=config.d.ts.map