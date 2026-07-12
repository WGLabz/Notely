/**
 * gitService.cjs — Git operations for Notely via simple-git.
 *
 * All exported functions are async and return { ok: true, data } or { ok: false, error: string }.
 * They never throw — callers receive structured results.
 *
 * Git binary must be on PATH. Use detectGit() before any operation to check availability.
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// simple-git is imported lazily so the app still starts if it somehow isn't installed.
function getSimpleGit() {
  return require("simple-git");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return { ok: false, error: message };
}

function git(workspacePath, options = {}) {
  const simpleGit = getSimpleGit();
  return simpleGit(workspacePath, {
    binary: "git",
    maxConcurrentProcesses: 4,
    trimmed: true,
    ...options,
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function shortHash(hash) {
  return String(hash || "").slice(0, 7);
}

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Check if git binary is available on PATH.
 * @returns {{ ok: true, data: { available: true, version: string } } | { ok: true, data: { available: false } }}
 */
async function detectGit() {
  try {
    const simpleGit = getSimpleGit();
    // Use a temp dir — we only care whether git is on PATH
    const tmpDir = os.tmpdir();
    const version = await simpleGit(tmpDir).raw(["--version"]);
    return ok({ available: true, version: String(version || "").trim() });
  } catch {
    return ok({ available: false, version: "" });
  }
}

/**
 * Check whether a directory is (or is inside) a git repository.
 * Returns the repository root path, or null if not in a repo.
 */
async function findRepoRoot(workspacePath) {
  try {
    const root = await git(workspacePath).revparse(["--show-toplevel"]);
    return String(root || "").trim() || null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ ok: true, data: { isRepo: bool, repoRoot: string|null } }}
 */
async function getRepoInfo(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    return ok({ isRepo: repoRoot !== null, repoRoot });
  } catch (err) {
    return fail(err);
  }
}

// ─── Repository Init ──────────────────────────────────────────────────────────

/**
 * Initialize a new git repository in workspacePath.
 * Creates README.md, .gitignore, and an initial commit if the directory
 * is not already a repo.
 */
async function initRepo(workspacePath) {
  try {
    const g = git(workspacePath);

    // Already a repo?
    const repoRoot = await findRepoRoot(workspacePath);
    if (repoRoot) {
      return ok({ alreadyInitialized: true, repoRoot });
    }

    await g.init();

    // README
    const readmePath = path.join(workspacePath, "README.md");
    if (!fs.existsSync(readmePath)) {
      const name = path.basename(workspacePath);
      fs.writeFileSync(
        readmePath,
        `# ${name}\n\nNotes workspace managed by [Notely](https://github.com/WGLabz/notely).\n`,
        "utf8"
      );
    }

    // .gitignore
    const gitignorePath = path.join(workspacePath, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(
        gitignorePath,
        "# Notes app internal data\n.notes-app/\n\n# OS\n.DS_Store\nThumbs.db\n",
        "utf8"
      );
    }

    // Set default branch to main
    try {
      await g.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
    } catch {
      // Git version may not support this; fall through
    }

    // Stage everything and initial commit
    await g.add(".");
    await g.commit("Initial commit", { "--allow-empty": null });

    const repoRootResult = await findRepoRoot(workspacePath);
    return ok({ alreadyInitialized: false, repoRoot: repoRootResult || workspacePath });
  } catch (err) {
    return fail(err);
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Get the working tree status.
 * @returns {{ ok: true, data: { branch, upstream, ahead, behind, files[] } }}
 */
async function getStatus(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);
    const status = await g.status();

    const files = [
      ...status.modified.map((p) => ({ path: p, status: "modified" })),
      ...status.created.map((p) => ({ path: p, status: "added" })),
      ...status.deleted.map((p) => ({ path: p, status: "deleted" })),
      ...status.renamed.map((r) => ({
        path: typeof r === "string" ? r : (r.to || r),
        from: typeof r === "object" ? r.from : null,
        status: "renamed",
      })),
      ...status.not_added.map((p) => ({ path: p, status: "untracked" })),
      ...status.conflicted.map((p) => ({ path: p, status: "conflicted" })),
      ...status.staged.filter(
        (p) => !status.modified.includes(p) && !status.created.includes(p)
      ).map((p) => ({ path: p, status: "staged" })),
    ];

    return ok({
      branch: status.current || "",
      upstream: status.tracking || "",
      ahead: Number(status.ahead) || 0,
      behind: Number(status.behind) || 0,
      files,
      isClean: status.isClean(),
      repoRoot,
    });
  } catch (err) {
    return fail(err);
  }
}

// ─── Log ─────────────────────────────────────────────────────────────────────

const LOG_FORMAT = {
  hash: "%H",
  shortHash: "%h",
  message: "%s",
  body: "%b",
  authorName: "%an",
  authorEmail: "%ae",
  date: "%aI", // ISO 8601
  refs: "%D",
};

/**
 * Get commit log.
 * @param {string} workspacePath
 * @param {{ filePath?: string, limit?: number, skip?: number, branch?: string }} options
 */
async function getLog(workspacePath, options = {}) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);
    const { filePath, limit = 100, skip = 0, branch } = options;

    const logOptions = {
      format: LOG_FORMAT,
      maxCount: Math.min(Number(limit) || 100, 500),
      "--skip": String(Number(skip) || 0),
    };

    if (branch) logOptions[branch] = null;

    let logResult;
    if (filePath) {
      const relPath = path.relative(repoRoot, path.resolve(filePath));
      logResult = await g.log({ ...logOptions, file: relPath });
    } else {
      logResult = await g.log(logOptions);
    }

    const commits = (logResult.all || []).map((c) => ({
      hash: c.hash,
      shortHash: c.shortHash || shortHash(c.hash),
      message: String(c.message || "").trim(),
      body: String(c.body || "").trim(),
      author: String(c.authorName || "").trim(),
      authorEmail: String(c.authorEmail || "").trim(),
      date: c.date,
      refs: String(c.refs || "").trim(),
      tags: String(c.refs || "").split(",").map((r) => r.trim()).filter((r) => r.startsWith("tag: ")).map((r) => r.slice(5)),
      branches: String(c.refs || "").split(",").map((r) => r.trim()).filter((r) => r && !r.startsWith("tag: ") && !r.startsWith("HEAD")),
    }));

    return ok(commits);
  } catch (err) {
    return fail(err);
  }
}

/**
 * Get which files changed in a specific commit.
 */
async function getCommitFiles(workspacePath, commitHash) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);
    const output = await g.raw([
      "diff-tree",
      "--no-commit-id",
      "-r",
      "--name-status",
      commitHash,
    ]);

    const files = String(output || "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split("\t");
        return { status: String(status || "").trim(), path: String(rest[rest.length - 1] || "").trim() };
      });

    return ok(files);
  } catch (err) {
    return fail(err);
  }
}

// ─── File at Commit ───────────────────────────────────────────────────────────

/**
 * Get the content of a file at a specific commit.
 */
async function getFileAtCommit(workspacePath, commitHash, filePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const resolvedPath = path.resolve(repoRoot, filePath);
    const relPath = path.relative(repoRoot, resolvedPath).replace(/\\/g, "/");
    if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
      return fail(`File '${path.basename(filePath)}' is outside the repository root at '${repoRoot}'.`);
    }

    const g = git(repoRoot);
    if (commitHash === "WORKING" || !commitHash) {
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, "utf8");
        return ok(String(content || ""));
      }
      return ok("");
    }
    const content = await g.show([`${commitHash}:${relPath}`]);
    return ok(String(content || ""));
  } catch (err) {
    return fail(err);
  }
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Get unified diff between two commits (or commit vs working tree).
 * @param {string} workspacePath
 * @param {string} fromHash - "HEAD" | commit hash | branch name
 * @param {string} toHash   - "WORKING" for working tree | commit hash | branch name
 * @param {string|null} filePath - optional file filter
 */
async function getFileDiff(workspacePath, fromHash, toHash, filePath = null) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);
    const args = ["diff", "--unified=3"];

    if (toHash === "WORKING") {
      args.push(fromHash);
    } else {
      args.push(`${fromHash}..${toHash}`);
    }

    if (filePath) {
      const relPath = path.relative(repoRoot, path.resolve(repoRoot, filePath)).replace(/\\/g, "/");
      args.push("--", relPath);
    }

    const diff = await g.raw(args);
    return ok(String(diff || ""));
  } catch (err) {
    return fail(err);
  }
}

// ─── Commit (user-triggered) ──────────────────────────────────────────────────

/**
 * Stage specified files (or all changes) and create a commit.
 * This is ALWAYS user-triggered. Never called automatically.
 *
 * @param {string} workspacePath
 * @param {{ message: string, filePaths?: string[] }} options
 */
async function commit(workspacePath, options) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const message = String(options?.message || "").trim();
    if (!message) return fail("Commit message is required.");

    const g = git(repoRoot);

    const filePaths = Array.isArray(options?.filePaths) && options.filePaths.length > 0
      ? options.filePaths.map((fp) => path.relative(repoRoot, path.resolve(repoRoot, fp)).replace(/\\/g, "/"))
      : ["."];

    for (const fp of filePaths) {
      await g.add(fp);
    }

    const result = await g.commit(message);

    return ok({
      hash: result.commit || "",
      branch: result.branch || "",
      summary: result.summary || {},
    });
  } catch (err) {
    return fail(err);
  }
}

// ─── Restore ─────────────────────────────────────────────────────────────────

/**
 * Restore a single file to its state at a given commit.
 * Creates a new commit so history is NEVER rewritten.
 *
 * @param {string} workspacePath
 * @param {string} commitHash
 * @param {string} filePath
 */
async function restoreFileAtCommit(workspacePath, commitHash, filePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);
    const relPath = path.relative(repoRoot, path.resolve(repoRoot, filePath)).replace(/\\/g, "/");

    // Checkout the file at the given commit into the working tree
    await g.raw(["checkout", commitHash, "--", relPath]);

    // Immediately commit the restore (never rewrite history)
    const fileName = path.basename(filePath);
    const shortCommit = shortHash(commitHash);
    const message = `Restored ${fileName} to ${shortCommit}`;

    await g.add(relPath);
    const result = await g.commit(message);

    return ok({
      hash: result.commit || "",
      message,
      restoredFrom: commitHash,
      filePath,
    });
  } catch (err) {
    return fail(err);
  }
}

// ─── Branches ─────────────────────────────────────────────────────────────────

async function listBranches(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const result = await git(repoRoot).branchLocal();

    const branches = (result.all || []).map((name) => {
      return {
        name,
        current: name === result.current,
        remote: false,
      };
    });

    return ok({ branches, current: result.current });
  } catch (err) {
    return fail(err);
  }
}

async function createBranch(workspacePath, name, from = null) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);
    if (from) {
      await g.checkoutBranch(name, from);
    } else {
      await g.checkoutLocalBranch(name);
    }
    return ok({ name });
  } catch (err) {
    return fail(err);
  }
}

async function renameBranch(workspacePath, oldName, newName) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    await git(repoRoot).raw(["branch", "-m", oldName, newName]);
    return ok({ oldName, newName });
  } catch (err) {
    return fail(err);
  }
}

async function deleteBranch(workspacePath, name, force = false) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const flag = force ? "-D" : "-d";
    await git(repoRoot).raw(["branch", flag, name]);
    return ok({ name });
  } catch (err) {
    return fail(err);
  }
}

async function switchBranch(workspacePath, name) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    await git(repoRoot).checkout(name);
    return ok({ name });
  } catch (err) {
    return fail(err);
  }
}

async function mergeBranch(workspacePath, from) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const result = await git(repoRoot).merge([from]);
    return ok({ result: String(result || "") });
  } catch (err) {
    return fail(err);
  }
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

async function listTags(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const output = await git(repoRoot).raw([
      "tag",
      "-l",
      "--format=%(refname:short)\t%(objectname:short)\t%(*objectname:short)\t%(creatordate:iso)\t%(subject)",
    ]);

    const tags = String(output || "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, hash, taggedHash, date, ...msgParts] = line.split("\t");
        return {
          name: String(name || "").trim(),
          hash: String(taggedHash || hash || "").trim(),
          date: String(date || "").trim(),
          message: msgParts.join("\t").trim(),
        };
      });

    return ok(tags);
  } catch (err) {
    return fail(err);
  }
}

async function createTag(workspacePath, options) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const { name, commitHash, message } = options;
    if (!name) return fail("Tag name is required.");

    const g = git(repoRoot);
    const args = ["tag"];

    if (message) {
      args.push("-a", name, "-m", message);
    } else {
      args.push(name);
    }

    if (commitHash) args.push(commitHash);

    await g.raw(args);
    return ok({ name });
  } catch (err) {
    return fail(err);
  }
}

async function deleteTag(workspacePath, name) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    await git(repoRoot).raw(["tag", "-d", name]);
    return ok({ name });
  } catch (err) {
    return fail(err);
  }
}

// ─── Stash ────────────────────────────────────────────────────────────────────

async function stashList(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const output = await git(repoRoot).raw([
      "stash",
      "list",
      "--format=%gd\t%s\t%aI",
    ]);

    const stashes = String(output || "")
      .split("\n")
      .filter(Boolean)
      .map((line, index) => {
        const [ref, message, date] = line.split("\t");
        return {
          index,
          ref: String(ref || "").trim(),
          message: String(message || "").trim(),
          date: String(date || "").trim(),
        };
      });

    return ok(stashes);
  } catch (err) {
    return fail(err);
  }
}

async function stashPush(workspacePath, message = null) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const args = ["stash", "push"];
    if (message) args.push("-m", message);

    await git(repoRoot).raw(args);
    return ok({});
  } catch (err) {
    return fail(err);
  }
}

async function stashPop(workspacePath, index = null) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const args = ["stash", "pop"];
    if (index !== null && index !== undefined) args.push(`stash@{${index}}`);

    await git(repoRoot).raw(args);
    return ok({});
  } catch (err) {
    return fail(err);
  }
}

async function stashDrop(workspacePath, index) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    await git(repoRoot).raw(["stash", "drop", `stash@{${index}}`]);
    return ok({});
  } catch (err) {
    return fail(err);
  }
}

// ─── Remotes ──────────────────────────────────────────────────────────────────

async function listRemotes(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const output = await git(repoRoot).raw(["remote", "-v"]);
    const seen = new Map();

    String(output || "")
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
        if (!match) return;
        const [, name, url, type] = match;
        if (!seen.has(name)) seen.set(name, { name, fetchUrl: "", pushUrl: "" });
        const entry = seen.get(name);
        if (type === "fetch") entry.fetchUrl = url;
        if (type === "push") entry.pushUrl = url;
      });

    return ok([...seen.values()]);
  } catch (err) {
    return fail(err);
  }
}

async function addRemote(workspacePath, name, url) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    await git(repoRoot).addRemote(name, url);
    return ok({ name, url });
  } catch (err) {
    return fail(err);
  }
}

async function removeRemote(workspacePath, name) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    await git(repoRoot).removeRemote(name);
    return ok({ name });
  } catch (err) {
    return fail(err);
  }
}



/**
 * Inject PAT into HTTPS URL if provided.
 */
function injectPAT(url, token) {
  if (!token || !url) return url;
  try {
    const u = new URL(url);
    u.username = "token";
    u.password = token;
    return u.toString();
  } catch {
    return url;
  }
}

async function push(workspacePath, options = {}) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const { remote = "origin", branch, auth } = options;
    const g = git(repoRoot);

    // For PAT auth, rewrite the remote URL temporarily
    let remoteUrl = null;
    if (auth?.type === "pat" && auth?.token) {
      try {
        const remoteOutput = await g.raw(["remote", "get-url", remote]);
        remoteUrl = injectPAT(String(remoteOutput || "").trim(), auth.token);
        await g.raw(["remote", "set-url", remote, remoteUrl]);
      } catch {
        // Ignore if remote doesn't exist yet
      }
    }

    const pushArgs = branch ? [remote, branch] : [remote];
    const result = await g.push(pushArgs);

    // Restore original URL (remove embedded credentials)
    if (remoteUrl) {
      try {
        const originalUrl = remoteUrl.replace(/\/\/[^@]+@/, "//");
        await g.raw(["remote", "set-url", remote, originalUrl]);
      } catch {
        // Best effort
      }
    }

    return ok({ result: String(result || "") });
  } catch (err) {
    return fail(err);
  }
}

async function pull(workspacePath, options = {}) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const { remote = "origin", branch, auth } = options;
    const g = git(repoRoot);

    let remoteUrl = null;
    if (auth?.type === "pat" && auth?.token) {
      try {
        const remoteOutput = await g.raw(["remote", "get-url", remote]);
        remoteUrl = injectPAT(String(remoteOutput || "").trim(), auth.token);
        await g.raw(["remote", "set-url", remote, remoteUrl]);
      } catch {
        // Ignore
      }
    }

    const pullArgs = branch ? [remote, branch] : [remote];
    const result = await g.pull(...pullArgs);

    if (remoteUrl) {
      try {
        const originalUrl = remoteUrl.replace(/\/\/[^@]+@/, "//");
        await g.raw(["remote", "set-url", remote, originalUrl]);
      } catch {
        // Best effort
      }
    }

    return ok({
      files: result?.files || [],
      insertions: result?.summary?.insertions || 0,
      deletions: result?.summary?.deletions || 0,
    });
  } catch (err) {
    return fail(err);
  }
}

async function fetch(workspacePath, options = {}) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const { remote, auth } = options;
    const g = git(repoRoot);

    let remoteUrl = null;
    const targetRemote = remote || "origin";
    if (auth?.type === "pat" && auth?.token) {
      try {
        const remoteOutput = await g.raw(["remote", "get-url", targetRemote]);
        remoteUrl = injectPAT(String(remoteOutput || "").trim(), auth.token);
        await g.raw(["remote", "set-url", targetRemote, remoteUrl]);
      } catch {
        // Ignore
      }
    }

    await g.fetch(remote ? [remote] : []);

    if (remoteUrl) {
      try {
        const originalUrl = remoteUrl.replace(/\/\/[^@]+@/, "//");
        await g.raw(["remote", "set-url", targetRemote, originalUrl]);
      } catch {
        // Best effort
      }
    }

    return ok({});
  } catch (err) {
    return fail(err);
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search commits by message, author, date range, or file path.
 * @param {string} workspacePath
 * @param {{ query: string, type: 'message'|'author'|'file'|'date' }}
 */
async function search(workspacePath, options) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const { query, type = "message" } = options;
    if (!query) return ok([]);

    const g = git(repoRoot);
    const logOptions = {
      format: LOG_FORMAT,
      maxCount: 200,
    };

    if (type === "message") {
      logOptions["--grep"] = query;
      logOptions["--regexp-ignore-case"] = null;
    } else if (type === "author") {
      logOptions["--author"] = query;
      logOptions["--regexp-ignore-case"] = null;
    } else if (type === "file") {
      const logResult = await g.log({
        ...logOptions,
        file: query,
      });
      return ok(
        (logResult.all || []).map((c) => ({
          hash: c.hash,
          shortHash: c.shortHash || shortHash(c.hash),
          message: c.message,
          author: c.authorName,
          date: c.date,
        }))
      );
    } else if (type === "date") {
      logOptions["--after"] = query;
    }

    const result = await g.log(logOptions);
    return ok(
      (result.all || []).map((c) => ({
        hash: c.hash,
        shortHash: c.shortHash || shortHash(c.hash),
        message: c.message,
        author: c.authorName,
        date: c.date,
      }))
    );
  } catch (err) {
    return fail(err);
  }
}

// ─── Deleted Files ────────────────────────────────────────────────────────────

/**
 * Find files that existed in git history but have since been deleted.
 */
async function getDeletedFiles(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const output = await git(repoRoot).raw([
      "log",
      "--diff-filter=D",
      "--name-only",
      "--format=%H\t%s\t%aI",
    ]);

    const lines = String(output || "").split("\n");
    const results = [];
    let currentCommit = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.includes("\t")) {
        const parts = line.split("\t");
        currentCommit = {
          hash: parts[0],
          message: parts[1] || "",
          date: parts[2] || "",
        };
      } else if (currentCommit) {
        results.push({
          path: line.trim(),
          lastCommit: currentCommit.hash,
          lastMessage: currentCommit.message,
          lastDate: currentCommit.date,
        });
      }
    }

    return ok(results);
  } catch (err) {
    return fail(err);
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function getWorkspaceStats(workspacePath) {
  try {
    const repoRoot = await findRepoRoot(workspacePath);
    if (!repoRoot) return fail("Not a git repository.");

    const g = git(repoRoot);

    const [countOutput, branchResult, tagResult, contributorOutput] = await Promise.all([
      g.raw(["rev-list", "--count", "HEAD"]).catch(() => "0"),
      g.branch(["-a"]).catch(() => ({ all: [] })),
      g.tags().catch(() => ({ all: [] })),
      g.raw(["shortlog", "-sn", "--no-merges"]).catch(() => ""),
    ]);

    const totalCommits = parseInt(String(countOutput || "0").trim(), 10) || 0;
    const branchCount = (branchResult.all || []).filter((b) => !b.includes("HEAD")).length;
    const tagCount = (tagResult.all || []).length;

    const contributors = String(contributorOutput || "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^\s*(\d+)\s+(.+)$/);
        return match ? { commits: parseInt(match[1], 10), name: match[2].trim() } : null;
      })
      .filter(Boolean);

    // Rough repo size
    let repoSizeBytes = 0;
    const gitDir = path.join(repoRoot, ".git");
    if (fs.existsSync(gitDir)) {
      try {
        const packDir = path.join(gitDir, "objects", "pack");
        if (fs.existsSync(packDir)) {
          const files = fs.readdirSync(packDir);
          for (const f of files) {
            try {
              repoSizeBytes += fs.statSync(path.join(packDir, f)).size;
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Best effort
      }
    }

    return ok({
      totalCommits,
      branches: branchCount,
      tags: tagCount,
      contributors,
      repoSizeBytes,
      repoRoot,
    });
  } catch (err) {
    return fail(err);
  }
}

// ─── Migration from Legacy ────────────────────────────────────────────────────

const MIGRATION_FLAG = ".git-migration-done";

/**
 * One-time migration from the legacy file-backed version history into git commits.
 * Idempotent — safe to call multiple times.
 *
 * @param {string} workspacePath
 * @param {object|null} metadataStore  — the existing MetadataStore instance
 * @returns {{ ok: true, data: { migrated: number, skipped: number, alreadyMigrated: bool } }}
 */
async function migrateFromLegacy(workspacePath, metadataStore = null) {
  try {
    const notesAppDir = path.join(workspacePath, ".notes-app");
    const flagFile = path.join(notesAppDir, MIGRATION_FLAG);

    // Already done
    if (fs.existsSync(flagFile)) {
      return ok({ alreadyMigrated: true, migrated: 0, skipped: 0 });
    }

    // No metadata store = nothing to migrate
    if (!metadataStore || typeof metadataStore.getWorkspaceActivity !== "function") {
      ensureDir(notesAppDir);
      fs.writeFileSync(flagFile, nowIso(), "utf8");
      return ok({ alreadyMigrated: false, migrated: 0, skipped: 0 });
    }

    // Ensure we have a git repo to commit into
    const repoInfo = await getRepoInfo(workspacePath);
    if (!repoInfo.ok) return repoInfo;

    if (!repoInfo.data.isRepo) {
      const initResult = await initRepo(workspacePath);
      if (!initResult.ok) return initResult;
    }

    const repoRoot = repoInfo.data.repoRoot || (await findRepoRoot(workspacePath));
    if (!repoRoot) return fail("Unable to determine repo root after init.");

    // Get legacy history entries for this workspace (oldest first)
    const entries = metadataStore.getWorkspaceActivity(workspacePath, 5000);
    const sorted = [...(entries || [])].sort((a, b) =>
      (a.createdAt || "").localeCompare(b.createdAt || "")
    );

    const g = git(repoRoot);
    let migrated = 0;
    let skipped = 0;

    for (const entry of sorted) {
      const versionPath = String(entry.versionPath || "");

      // Only migrate file-backed versions
      if (!versionPath || versionPath.startsWith("p2p://") || !versionPath.endsWith(".md")) {
        skipped += 1;
        continue;
      }

      if (!fs.existsSync(versionPath)) {
        skipped += 1;
        continue;
      }

      try {
        const content = fs.readFileSync(versionPath, "utf8");
        const targetPath = path.resolve(String(entry.filePath || ""));

        if (!targetPath || !fs.existsSync(path.dirname(targetPath))) {
          skipped += 1;
          continue;
        }

        // Write the snapshot content to the original file
        fs.writeFileSync(targetPath, content, "utf8");

        const relPath = path.relative(repoRoot, targetPath).replace(/\\/g, "/");
        await g.add(relPath);

        const reason = String(entry.reason || "snapshot").replace(/[^a-z0-9-_ ]/gi, "");
        const date = String(entry.createdAt || nowIso()).slice(0, 10);
        const message = `Migrated: ${reason} (${date})`;

        // Preserve original timestamp if possible
        const commitDate = entry.createdAt || nowIso();
        await g.env({
          GIT_AUTHOR_DATE: commitDate,
          GIT_COMMITTER_DATE: commitDate,
        }).commit(message, ["--allow-empty"]);

        migrated += 1;
      } catch {
        skipped += 1;
      }
    }

    // Write migration flag
    ensureDir(notesAppDir);
    fs.writeFileSync(flagFile, nowIso(), "utf8");

    return ok({ alreadyMigrated: false, migrated, skipped });
  } catch (err) {
    return fail(err);
  }
}

// ─── Gitignore Managed Block ──────────────────────────────────────────────────

const MANAGED_BLOCK_START = "# >>> Notes App Managed >>>";
const MANAGED_BLOCK_END = "# <<< Notes App Managed <<<";

/**
 * Ensure the managed .notes-app/ block exists in .gitignore.
 * Only modifies the managed block — never touches user rules.
 */
async function ensureManagedGitignoreBlock(repoRoot) {
  try {
    const gitignorePath = path.join(repoRoot, ".gitignore");
    const existing = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, "utf8")
      : "";

    if (existing.includes(MANAGED_BLOCK_START)) return ok({ changed: false });

    const block = `\n${MANAGED_BLOCK_START}\n.notes-app/\n${MANAGED_BLOCK_END}\n`;
    const needsNewline = existing.length > 0 && !existing.endsWith("\n");
    fs.writeFileSync(gitignorePath, `${existing}${needsNewline ? "\n" : ""}${block}`, "utf8");

    return ok({ changed: true });
  } catch (err) {
    return fail(err);
  }
}

/**
 * Remove only the managed block from .gitignore.
 * Never modifies user rules.
 */
async function removeManagedGitignoreBlock(repoRoot) {
  try {
    const gitignorePath = path.join(repoRoot, ".gitignore");
    if (!fs.existsSync(gitignorePath)) return ok({ changed: false });

    const existing = fs.readFileSync(gitignorePath, "utf8");
    const startIdx = existing.indexOf(MANAGED_BLOCK_START);
    const endIdx = existing.indexOf(MANAGED_BLOCK_END);

    if (startIdx === -1) return ok({ changed: false });

    const endPos = endIdx !== -1 ? endIdx + MANAGED_BLOCK_END.length : existing.length;
    const before = existing.slice(0, startIdx).replace(/\n+$/, "");
    const after = existing.slice(endPos);
    const next = `${before}${after}`.replace(/^\n+/, "");

    fs.writeFileSync(gitignorePath, next.length > 0 ? `${next}\n` : "", "utf8");
    return ok({ changed: true });
  } catch (err) {
    return fail(err);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  detectGit,
  findRepoRoot,
  getRepoInfo,
  initRepo,
  getStatus,
  getLog,
  getCommitFiles,
  getFileAtCommit,
  getFileDiff,
  commit,
  restoreFileAtCommit,
  listBranches,
  createBranch,
  renameBranch,
  deleteBranch,
  switchBranch,
  mergeBranch,
  listTags,
  createTag,
  deleteTag,
  stashList,
  stashPush,
  stashPop,
  stashDrop,
  listRemotes,
  addRemote,
  removeRemote,
  push,
  pull,
  fetch,
  search,
  getDeletedFiles,
  getWorkspaceStats,
  migrateFromLegacy,
  ensureManagedGitignoreBlock,
  removeManagedGitignoreBlock,
};
