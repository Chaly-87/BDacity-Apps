/* ============================================================================
   HOTFIX TTS Render/Linux — regressão mínima do runtime.
   NÃO corre o binário Linux (o CI/local é Windows): prova é que TUDO o que o
   Piper Linux precisa está versionado, com os nomes exactos que o loader
   procura, e que a linha de argumentos para Linux não herda flags do Windows.
   ========================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const piperArgs = (await import("./welcome-tts.mjs")).piperArgs;
const piperEnv = (await import("./welcome-tts.mjs")).piperEnv;
const welcomePhrase = (await import("./welcome-tts.mjs")).welcomePhrase;

const LINUX = path.join(root, "tts", "linux");
const read = (p) => fs.readFileSync(p);

function assertElf(p) {
  const buf = read(p);
  assert.equal(buf[0], 0x7f, `${path.basename(p)}: sem magia ELF`);
  assert.equal(buf.toString("ascii", 1, 4), "ELF", `${path.basename(p)}: não é ELF`);
}

test("Linux: binário Piper presente e é ELF x86_64", () => {
  const p = path.join(LINUX, "piper");
  assertElf(p);
  const buf = read(p);
  // e_machine == 0x3E (x86_64) no header ELF
  assert.equal(buf.readUInt16LE(18), 0x3e, "o binário não é x86_64");
});

test("Linux: todas as .so que o loader procura estão no directório", () => {
  const needed = ["libpiper_phonemize.so.1", "libespeak-ng.so.1", "libonnxruntime.so.1.14.1"];
  const bin = read(path.join(LINUX, "piper"));
  for (const soname of needed) {
    assert.ok(bin.includes(soname), `o binário referencia ${soname}`);
    const p = path.join(LINUX, soname);
    assert.ok(fs.existsSync(p), `falta ${soname} em tts/linux/`);
    assertElf(p);
    assert.ok(read(p).length > 1024, `${soname} demasiado pequeno`);
  }
});

test("Linux: espeak-ng-data completo (fonética pt incluída)", () => {
  const data = path.join(LINUX, "espeak-ng-data");
  for (const f of ["phontab", "phondata", "phonindex", "phondata-manifest", "intonations", "pt_dict", path.join("lang", "roa", "pt")]) {
    const p = path.join(data, f);
    assert.ok(fs.existsSync(p), `falta espeak-ng-data/${f}`);
    assert.ok(read(p).length > 0, `espeak-ng-data/${f} vazio`);
  }
});

test("Modelo pt-PT presente, é pt_PT e a frase é a correcta", () => {
  const model = path.join(root, "tts", "pt_PT-tugao-medium.onnx");
  const json = `${model}.json`;
  assert.ok(fs.existsSync(model), "falta tts/pt_PT-tugao-medium.onnx");
  assert.ok(fs.existsSync(json), "falta tts/pt_PT-tugao-medium.onnx.json");
  assert.ok(read(model).length > 60_000_000, "modelo incompleto");
  const cfg = JSON.parse(fs.readFileSync(json, "utf8"));
  assert.equal(cfg.language.code, "pt_PT", "o modelo não é pt_PT");
  assert.equal(welcomePhrase("Hugo"), "Bem-vindo, Hugo.");
});

test("Linux: argumentos sem --language e com --espeak_data", () => {
  const args = piperArgs("/x/pt_PT-tugao-medium.onnx", "linux");
  assert.ok(args.includes("--json-input"), "falta --json-input");
  assert.ok(args.includes("--output_file") && args[args.indexOf("--output_file") + 1] === "-", "WAV tem de ir para stdout");
  assert.equal(args.includes("--language"), false, "--language não existe no Piper Linux");
  const espeak = args.indexOf("--espeak_data");
  assert.ok(espeak > 0, "falta --espeak_data");
  assert.equal(args[espeak + 1], path.join(LINUX, "espeak-ng-data"));
  // stof() do C++ espera ponto decimal sempre
  assert.equal(args[args.indexOf("--length_scale") + 1], "1.5");
  assert.equal(args[args.indexOf("--sentence_silence") + 1], "0.3");
});

test("Windows: Piper oficial usa a fonética eSpeak do modelo pt-PT", () => {
  const args = piperArgs("C:\\x\\pt_PT-tugao-medium.onnx", "win32");
  const lang = args.indexOf("--language");
  assert.equal(lang, -1, "Piper oficial não aceita --language");
  assert.ok(args.includes("--espeak_data"));
  assert.equal(args[args.indexOf("--length_scale")+1], "1.5");
  assert.ok(args.includes("--json-input"));
  assert.ok(args.includes("--output_file"));
});

test("Linux: env de spawn leva LD_LIBRARY_PATH e ESPEAK_DATA_PATH", () => {
  const env = piperEnv("linux");
  assert.equal(env.LD_LIBRARY_PATH, LINUX);
  assert.equal(env.ESPEAK_DATA_PATH, path.join(LINUX, "espeak-ng-data"));
  assert.equal(piperEnv("win32").LD_LIBRARY_PATH, undefined, "Windows não recebe env de Linux");
});
