// Diff quality check (Squad Optimized — Plain Concepts).
// Fails on: comment lines > maxCommentRatio of added code, test lines > code lines,
// too many test cases per 1k added lines, skipped/focused tests, assertion-less tests,
// snapshot-only or mock-only tests.
import { addedLines, readConfig, isTestFile, isCodeFile } from './pc-lib.mjs';

const cfg = readConfig().diff;
const added = addedLines();
let code = 0;
let comments = 0;
let testLines = 0;
let testCases = 0;
const errors = [];

const COMMENT = /^\s*(\/\/|#(?!include|region|endregion|!)|\/\*|\*(?!\/)|<!--|""")/;
const TEST_CASE = /\b(it|test|Fact|Theory|TestMethod|def test_|func Test)\b\s*[(\]:]|\[(Fact|Theory|Test|TestMethod)\]|^\s*def test_|^\s*func Test/;
const SKIP_FOCUS = /\b(it|describe|test)\.(skip|only)\b|\bx(it|describe)\(|\bf(it|describe)\(|\[Fact\(Skip|\[Ignore\]|@pytest\.mark\.skip|\bt\.Skip\(/;
const ASSERT = /\b(expect|assert\w*|Assert\.|should|verify|toBe|toEqual|Equal\(|require\.)/;
const SNAPSHOT = /toMatch(Inline)?Snapshot|Verify\(|snapshot/i;
const MOCK = /\b(vi|jest)\.(fn|mock|spyOn)|Mock<|Substitute\.For|mocker\.|MagicMock|gomock/;

for (const [file, lines] of added) {
  if (!isCodeFile(file)) continue;
  const content = lines.filter((l) => l.trim());
  if (isTestFile(file)) {
    testLines += content.length;
    const text = content.join('\n');
    const cases = content.filter((l) => TEST_CASE.test(l)).length;
    testCases += cases;
    if (SKIP_FOCUS.test(text)) errors.push(`${file}: skipped or focused test added.`);
    if (cases > 0 && !ASSERT.test(text)) errors.push(`${file}: tests added without assertions.`);
    if (cases > 0 && SNAPSHOT.test(text) && !/\b(toBe|toEqual|Equal\(|assert )/.test(text)) errors.push(`${file}: snapshot-only tests.`);
    if (cases > 0 && MOCK.test(text) && !/\b(toBe|toEqual|toHaveBeenCalledWith|Equal\(|assert )/.test(text)) errors.push(`${file}: mock-only tests (assert behaviour, not wiring).`);
  } else {
    for (const l of content) (COMMENT.test(l) ? comments++ : code++);
  }
}

if (code >= 20 && comments / code > cfg.maxCommentRatio) {
  errors.push(`Comment lines are ${(100 * comments / code).toFixed(0)}% of added code (max ${(cfg.maxCommentRatio * 100).toFixed(0)}%). Prefer clear names over narration.`);
}
if (code >= 20 && testLines > code * cfg.maxTestToCodeRatio) {
  errors.push(`Added test lines (${testLines}) exceed added code lines (${code}). Test behaviour, not every branch twice.`);
}
if (code >= 50 && (testCases / code) * 1000 > cfg.maxTestsPerKloc) {
  errors.push(`${testCases} test cases for ${code} added lines (> ${cfg.maxTestsPerKloc}/1k). Consolidate into meaningful scenarios.`);
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log(`Diff check passed (code: ${code}, comments: ${comments}, test lines: ${testLines}, test cases: ${testCases}).`);
