import { DISTANT_CODE } from "./level-one";

const base = (code) => new AppError(code, "Too deep", 500);
const one = (code) => base(code);
const two = (code) => one(code);
const three = (code) => two(code);
const four = (code) => three(code);

throw new AppError(DISTANT_CODE, "Import chain is over the bound", 500);
throw four("FACTORY_TOO_DEEP");
