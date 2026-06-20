import type { ErrorAtlasConfig } from "./types.js";
export interface SourceFix {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    insertionIndex: number;
    insertion: string;
}
export declare function planSourceFixes(root: string, config: ErrorAtlasConfig): Promise<SourceFix[]>;
export declare function applySourceFixes(root: string, fixes: SourceFix[]): Promise<void>;
export declare function renderSourceFixes(fixes: SourceFix[]): string;
//# sourceMappingURL=source-fixes.d.ts.map