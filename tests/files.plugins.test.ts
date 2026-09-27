import { afterEach, describe, expect, test, beforeEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry, list } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { isProtectedPath } from "../plugins/files/protectedPaths.ts";
import {
  MAX_IMAGE_SIZE_BYTES,
  sniffImageMediaType,
} from "../plugins/files/image.ts";

describe("files plugins (REQ-plugins-081..083)", () => {
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
  });

  test("plugins list includes files-* with markings", () => {
    const byName = Object.fromEntries(list().map((e) => [e.name, e]));
    for (const name of [
      "files-read",
      "files-write",
      "files-edit",
      "files-glob",
      "files-list",
      "files-delete",
    ]) {
      expect(byName[name]).toBeTruthy();
    }
    expect(byName["files-read"]!.minTier).toBe(0);
    expect(byName["files-write"]!.minTier).toBe(2);
    expect(byName["files-edit"]!.minTier).toBe(2);
    expect(byName["files-delete"]!.minTier).toBe(2);
    expect(byName["files-delete"]!.dangerous).toBe(true);
    expect(byName["files-write"]!.dangerous).toBe(false);
    expect(byName["files-write"]!.mutating).toBe(true);
    expect(byName["files-edit"]!.mutating).toBe(true);
  });

  test("isProtectedPath catches SAFE-2 infra", () => {
    expect(isProtectedPath(".env")).toBe(true);
    expect(isProtectedPath(".env.local")).toBe(true);
    expect(isProtectedPath("subdir/.env")).toBe(true);
    expect(isProtectedPath(".git/HEAD")).toBe(true);
    expect(isProtectedPath("fledge.toml")).toBe(true);
    expect(isProtectedPath("specs/plugins/plugins.spec.md")).toBe(true);
    expect(isProtectedPath("foo.spec.md")).toBe(true);
    expect(isProtectedPath("wallet-keystore.json")).toBe(true);
    expect(isProtectedPath("my.keystore")).toBe(true);
    expect(isProtectedPath("bunfig.toml")).toBe(true);
    expect(isProtectedPath("sub/pkg/bunfig.toml")).toBe(true);
    expect(isProtectedPath(".bunfig.toml")).toBe(true);
    expect(isProtectedPath("BunFig.TOML")).toBe(true);
    expect(isProtectedPath("docs/bunfig.md")).toBe(false);
    expect(isProtectedPath("src/cli.ts")).toBe(false);
    expect(isProtectedPath("README.md")).toBe(false);
  });

  test("happy path read/write/edit/glob/list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-files-"));
    try {
      writeFileSync(join(dir, "hello.txt"), "hello world\n");
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");

      const wrote = await runPlugin({
        name: "files-write",
        args: ["note.md", "alpha"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(wrote.ok).toBe(true);
      expect(readFileSync(join(dir, "note.md"), "utf8")).toBe("alpha");

      const edited = await runPlugin({
        name: "files-edit",
        args: ["note.md", "--old", "alpha", "--new", "beta"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(edited.ok).toBe(true);
      expect(readFileSync(join(dir, "note.md"), "utf8")).toBe("beta");

      const read = await runPlugin({
        name: "files-read",
        args: ["note.md"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(read.ok).toBe(true);
      expect(read.message).toBe("beta");

      const globbed = await runPlugin({
        name: "files-glob",
        args: ["**/*.ts"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(globbed.ok).toBe(true);
      expect((globbed.data as { matches: string[] }).matches).toContain("src/a.ts");

      const listed = await runPlugin({
        name: "files-list",
        args: ["."],
        cwd: dir,
        nonInteractive: true,
      });
      expect(listed.ok).toBe(true);
      expect((listed.data as { count: number }).count).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("files-edit writes --new literally; $ replacement patterns are not expanded (REQ-plugins-237)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-files-dollar-"));
    try {
      const newStr = "echo $$HOME and $' tail $& $` $1 $<n>";
      writeFileSync(join(dir, "Makefile"), "run:\n\techo OLD\n");
      const single = await runPlugin({
        name: "files-edit",
        args: ["Makefile", "--old", "echo OLD", "--new", newStr],
        cwd: dir,
        nonInteractive: true,
      });
      expect(single.ok).toBe(true);
      expect(readFileSync(join(dir, "Makefile"), "utf8")).toBe(`run:\n\t${newStr}\n`);

      writeFileSync(join(dir, "twice.sh"), "echo OLD\necho OLD\n");
      const all = await runPlugin({
        name: "files-edit",
        args: ["twice.sh", "--old", "echo OLD", "--new", newStr, "--replace-all"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(all.ok).toBe(true);
      expect(readFileSync(join(dir, "twice.sh"), "utf8")).toBe(`${newStr}\n${newStr}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-2: files-write cannot plant a bunfig.toml preload (REQ-plugins-083)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-safe2-bunfig-"));
    try {
      for (const target of ["bunfig.toml", ".bunfig.toml", "sub/bunfig.toml"]) {
        const w = await runPlugin({
          name: "files-write",
          args: [target, 'preload = ["./p.ts"]\n'],
          cwd: dir,
          nonInteractive: true,
        });
        expect(w.ok).toBe(false);
        expect(w.exitCode).toBe(2);
        expect(w.error).toContain("SAFE-2");
        expect(existsSync(join(dir, target))).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("SAFE-2 deny write/edit/delete on protected paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-safe2-"));
    try {
      writeFileSync(join(dir, ".env"), "SECRET=1\n");
      writeFileSync(join(dir, "fledge.toml"), "[tasks]\n");
      mkdirSync(join(dir, "specs"));
      writeFileSync(join(dir, "specs", "x.spec.md"), "# spec\n");
      writeFileSync(join(dir, "wallet-keystore.json"), "{}\n");
      writeFileSync(join(dir, "ok.txt"), "ok\n");

      for (const target of [
        ".env",
        "fledge.toml",
        "specs/x.spec.md",
        "wallet-keystore.json",
      ]) {
        const w = await runPlugin({
          name: "files-write",
          args: [target, "HACKED"],
          cwd: dir,
          nonInteractive: true,
        });
        expect(w.ok).toBe(false);
        expect(w.exitCode).toBe(2);
        expect(w.error).toContain("SAFE-2");
        expect(readFileSync(join(dir, target), "utf8")).not.toBe("HACKED");
      }

      const editEnv = await runPlugin({
        name: "files-edit",
        args: [".env", "--old", "SECRET=1", "--new", "SECRET=2"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(editEnv.ok).toBe(false);
      expect(editEnv.error).toContain("SAFE-2");
      expect(readFileSync(join(dir, ".env"), "utf8")).toBe("SECRET=1\n");

      const del = await runPlugin({
        name: "files-delete",
        args: [".env"],
        cwd: dir,
        nonInteractive: true,
        allowlist: ["files-delete"],
      });
      expect(del.ok).toBe(false);
      expect(del.error).toContain("SAFE-2");
      expect(existsSync(join(dir, ".env"))).toBe(true);

      // ordinary file still writable
      const ok = await runPlugin({
        name: "files-write",
        args: ["ok.txt", "ok2"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(ok.ok).toBe(true);
      expect(readFileSync(join(dir, "ok.txt"), "utf8")).toBe("ok2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("path escape and symlink escape refused", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-escape-"));
    const outside = mkdtempSync(join(tmpdir(), "corvidinho-outside-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "nope\n");
      symlinkSync(outside, join(dir, "link-out"));

      const up = await runPlugin({
        name: "files-read",
        args: ["../secret.txt"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(up.ok).toBe(false);
      expect(up.error).toMatch(/traversal|escape|outside/i);

      const viaLink = await runPlugin({
        name: "files-read",
        args: ["link-out/secret.txt"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(viaLink.ok).toBe(false);
      expect(viaLink.error).toMatch(/escape|outside|traversal/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("files-delete SAFE-1 deny without allowlist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-deldeny-"));
    try {
      writeFileSync(join(dir, "x.txt"), "x\n");
      const denied = await runPlugin({
        name: "files-delete",
        args: ["x.txt"],
        cwd: dir,
        nonInteractive: true,
      });
      expect(denied.ok).toBe(false);
      expect(denied.exitCode).toBe(2);
      expect(denied.error).toContain("SAFE-1");
      expect(existsSync(join(dir, "x.txt"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** A real 1x1 PNG. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("files-read image mode (DISCORD-9 / REQ-plugins-427)", () => {
  const prevAdmin = process.env.CORVIDINHO_ACTING_IS_ADMIN;
  const prevActor = process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
  let dir = "";
  beforeEach(() => {
    clearRegistry();
    loadBuiltins();
    dir = mkdtempSync(join(tmpdir(), "corvidinho-files-img-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevAdmin === undefined) delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
    else process.env.CORVIDINHO_ACTING_IS_ADMIN = prevAdmin;
    if (prevActor === undefined) delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;
    else process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = prevActor;
  });

  const read = (path: string) =>
    runPlugin({ name: "files-read", args: [path], cwd: dir, json: true, nonInteractive: true });

  test("files-read on a PNG returns image metadata, not UTF-8 content", async () => {
    mkdirSync(join(dir, ".corvidinho", "attachments"), { recursive: true });
    const rel = ".corvidinho/attachments/m-0.png";
    writeFileSync(join(dir, rel), PNG_BYTES);

    const r = await read(rel);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({
      path: rel,
      bytes: PNG_BYTES.length,
      mediaType: "image/png",
      image: true,
    });
    expect((r.data as Record<string, unknown>).content).toBeUndefined();
    expect(r.message).toBe(
      `image ${rel} (image/png, ${PNG_BYTES.length} bytes) opened for viewing`,
    );
    // The pixels ride result.image only; they round-trip to the file bytes.
    expect(r.image?.mediaType).toBe("image/png");
    expect(r.image?.path).toBe(rel);
    expect(Buffer.from(r.image!.base64, "base64").equals(PNG_BYTES)).toBe(true);
    // What reaches tool text / CLI output is small and has no decode garbage.
    const text = JSON.stringify({ ok: r.ok, message: r.message, data: r.data });
    expect(text).not.toContain("\uFFFD");
    expect(text).not.toContain(r.image!.base64);
    expect(text.length).toBeLessThan(1024);
  });

  test("images are told apart by magic bytes, not by name", async () => {
    writeFileSync(join(dir, "photo.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]));
    writeFileSync(join(dir, "anim.gif"), Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"));
    writeFileSync(join(dir, "pic.webp"), Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")]));
    writeFileSync(join(dir, "screenshot.txt"), PNG_BYTES);
    writeFileSync(join(dir, "notes.png"), "just text in a .png name\n");

    expect((await read("photo.jpg")).image?.mediaType).toBe("image/jpeg");
    expect((await read("anim.gif")).image?.mediaType).toBe("image/gif");
    expect((await read("pic.webp")).image?.mediaType).toBe("image/webp");
    expect((await read("screenshot.txt")).image?.mediaType).toBe("image/png");

    const text = await read("notes.png");
    expect(text.ok).toBe(true);
    expect(text.image).toBeUndefined();
    expect((text.data as { content?: string }).content).toBe("just text in a .png name\n");

    expect(sniffImageMediaType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffImageMediaType(Buffer.from("RIFF\0\0\0\0WAVE", "latin1"))).toBeNull();
    expect(sniffImageMediaType(new Uint8Array())).toBeNull();
  });

  test("files-read refuses an image over 20MB", async () => {
    const big = join(dir, "huge.png");
    writeFileSync(big, PNG_BYTES);
    truncateSync(big, MAX_IMAGE_SIZE_BYTES + 1); // sparse: cheap on disk
    const r = await read("huge.png");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("refused: image 'huge.png'");
    expect(r.error).toContain("20MB");
    expect(r.image).toBeUndefined();
    expect(r.data).toBeUndefined();

    // Exactly at the cap is still an image.
    truncateSync(big, MAX_IMAGE_SIZE_BYTES);
    const atCap = await read("huge.png");
    expect(atCap.ok).toBe(true);
    expect(atCap.image?.mediaType).toBe("image/png");
  });

  test("a text file reads exactly as before", async () => {
    writeFileSync(join(dir, "hello.txt"), "héllo wörld\n");
    const r = await read("hello.txt");
    expect(r).toEqual({
      ok: true,
      data: { path: "hello.txt", bytes: Buffer.byteLength("héllo wörld\n"), content: "héllo wörld\n" },
      message: "héllo wörld\n",
    });
  });

  test("the path clamp and the ROLES-CHAT-8 secret gate still run first", async () => {
    const outside = mkdtempSync(join(tmpdir(), "corvidinho-files-img-out-"));
    try {
      writeFileSync(join(outside, "x.png"), PNG_BYTES);
      const escaped = await read(join(outside, "x.png"));
      expect(escaped.ok).toBe(false);
      expect(escaped.image).toBeUndefined();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }

    mkdirSync(join(dir, ".ssh"));
    writeFileSync(join(dir, ".ssh", "shot.png"), PNG_BYTES);
    process.env.CORVIDINHO_ACTING_IS_ADMIN = "0";
    process.env.CORVIDINHO_ACTING_DISCORD_USER_ID = "999999999999999999";
    const secret = await read(".ssh/shot.png");
    expect(secret.ok).toBe(false);
    expect(secret.exitCode).toBe(2);
    expect(secret.error).toContain("ROLES-CHAT-8");
    expect(secret.image).toBeUndefined();
  });
});
