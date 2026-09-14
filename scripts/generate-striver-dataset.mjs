import fs from "node:fs/promises";
import path from "node:path";

const STRIVER_URL =
  "https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z";

const OUTPUT_FILE = path.resolve("data/striver.json");

function extractLeetCodeSlugs(html) {
  /*
   * The Striver page is a client-side Next.js application.
   *
   * The LeetCode URLs are present in the page's embedded application
   * data, but are not necessarily rendered as <a> elements in the
   * initial DOM.
   *
   * Example:
   *
   * https://leetcode.com/problems/two-sum/
   *
   * We extract the stable LeetCode slug directly from the HTML.
   */

  const regex =
    /(?:https?:)?(?:\\\/\\\/|\/\/)(?:www\.)?leetcode\.com\/problems\/([a-z0-9-]+)/gi;

  const slugs = [];
  const seen = new Set();

  let match;

  while ((match = regex.exec(html)) !== null) {
    const slug = match[1].toLowerCase();

    if (seen.has(slug)) continue;

    seen.add(slug);
    slugs.push(slug);
  }

  return slugs;
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((word) => {
      if (!word) return "";

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function createProblem(slug) {
  return {
    sheetProblemId: `striver-${slug}`,
    title: titleFromSlug(slug),
    platform: "leetcode",
    platformSlug: slug,
    platformUrl: `https://leetcode.com/problems/${slug}/`,
  };
}

async function fetchStriverPage() {
  console.log("Fetching Striver A2Z sheet...");

  const response = await fetch(STRIVER_URL);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Striver sheet: ${response.status} ${response.statusText}`
    );
  }

  return await response.text();
}

async function loadExistingDataset() {
  try {
    const raw = await fs.readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      sheet: "striver",
      problems: [],
    };
  }
}

function preserveExistingData(problems, existingDataset) {
  const existingBySlug = new Map(
    existingDataset.problems.map((problem) => [
      problem.platformSlug,
      problem,
    ])
  );

  return problems.map((problem) => {
    const existing = existingBySlug.get(problem.platformSlug);

    if (!existing) {
      return problem;
    }

    return {
      ...problem,

      /*
       * VERY IMPORTANT:
       *
       * Preserve IDs already used by the extension.
       * Otherwise old completionState entries could stop matching.
       */
      sheetProblemId: existing.sheetProblemId,

      /*
       * Preserve manually verified titles.
       */
      title: existing.title || problem.title,

      /*
       * Preserve numeric LeetCode IDs if they already exist
       * in the current dataset.
       */
      ...(existing.platformProblemId
        ? {
            platformProblemId: existing.platformProblemId,
          }
        : {}),
    };
  });
}

function sortProblems(problems) {
  return [...problems].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}

async function main() {
  console.log("========================================");
  console.log("DSA AUTO TRACKER - DATASET GENERATOR");
  console.log("========================================");
  console.log();

  const html = await fetchStriverPage();

  console.log(
    `Downloaded ${(html.length / 1024).toFixed(1)} KB`
  );

  const rawMatches =
    html.match(/leetcode\.com\/problems\//gi)?.length ?? 0;

  console.log(`Raw LeetCode URL occurrences: ${rawMatches}`);

  const slugs = extractLeetCodeSlugs(html);

  console.log(`Unique LeetCode problems: ${slugs.length}`);

  if (slugs.length === 0) {
    throw new Error(
      "No LeetCode problems were found in the Striver page HTML. The page structure may have changed."
    );
  }

  const discoveredProblems = slugs.map(createProblem);

  const existingDataset = await loadExistingDataset();

  const problems = sortProblems(
    preserveExistingData(
      discoveredProblems,
      existingDataset
    )
  );

  const dataset = {
    sheet: "striver",
    problems,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), {
    recursive: true,
  });

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(dataset, null, 2) + "\n",
    "utf8"
  );

  console.log();
  console.log("========================================");
  console.log("DATASET GENERATED SUCCESSFULLY");
  console.log("========================================");
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Total mappings: ${problems.length}`);
  console.log();

  console.log("First 10 problems:");

  for (const [index, problem] of problems
    .slice(0, 10)
    .entries()) {
    console.log(
      `${index + 1}. ${problem.title} → ${problem.platformSlug}`
    );
  }

  console.log();
}

main().catch((error) => {
  console.error();
  console.error("Dataset generation failed:");
  console.error(error);
  process.exit(1);
});