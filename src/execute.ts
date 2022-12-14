import path from "path";
import fs from "fs";
import { Options } from "./index";
import { build } from "esbuild";
import { watchPlugin } from "./plugins/index";
import {
  error,
  getHash,
  handleAsyncErrorWithRun,
  normalize,
  readPkg,
  Uint8ArrayToString,
} from "./utils";
import { COMMON_JS } from "./constants";
import { spawn } from "child_process";
import Context from "./context";
import chalk from "chalk";
import { watcher } from "./watch";

export async function startExecute(rootPath: string, options: Options) {
  console.log("π " + chalk.green("εΌε§ε―ε¨..."));
  const { root } = options;
  //εε»Ίζ§θ‘δΈδΈζ
  const context = new Context(options);
  options.context = context;
  options.filename = path.basename(options.rootPath!);
  const [isExistPkg, type] = await readPkg(root!);
  if (isExistPkg) {
    options.type = type;
  }
  const outfile = normalize(
    fs.existsSync(path.resolve(root!, "node_modules"))
      ? path.resolve(root!, `node_modules/.ndmon/${options.filename}`)
      : path.resolve(root!, `.ndmon/${options.filename}`)
  );
  const outDir = normalize(path.dirname(outfile));
  options.outDir = outDir;
  options.outfile = outfile.endsWith(".ts")
    ? outfile.replace(/.ts$/, ".js")
    : outfile;
  await createBundleDir(outDir);
  //ζεε₯ε£δ»£η (ts=>js)
  await bundle(options);
  await setHash(options.outfile, context);
  console.log(chalk.green(`π ε―ε¨ζε,εΌε―ηε¬...`));
  nodeBundleFile(options); //ζ§θ‘ζεηδ»£η 
}

export async function createBundleDir(outDir: string) {
  if (!fs.existsSync(outDir)) {
    await fs.promises.mkdir(outDir);
  }
}

export async function setHash(outfile: string, context: Context) {
  const res = await handleAsyncErrorWithRun(async function () {
    const source = context.bundleResult
      ? Uint8ArrayToString(context.bundleResult.outputFiles![0].contents)
      : "";
    const hash = getHash(source);
    //ζζ°ηhashεΌδΈδΉεηδΈε,ιθ¦εε₯ζ°ηζδ»Ά
    if (context.hashMap[outfile] !== hash) {
      context.hashMap[outfile] = hash;
      await fs.promises.writeFile(outfile, source);
      return true;
    }
    return false;
  });
  if (res === undefined) {
    return false;
  }
  return res;
}

//ζεδ»£η 
export async function bundle(options: Options) {
  const { rootPath, type, outfile } = options;
  let buildResult;
  //ηε¬ε₯ε£ζδ»Άη?ε½
  watcher(rootPath!, options.context!);
  try {
    buildResult = await build({
      entryPoints: [rootPath!],
      platform: "node",
      bundle: true,
      format: type === COMMON_JS ? "cjs" : "esm",
      outfile,
      write: false,
      plugins: [watchPlugin(options.context!)],
    });
  } catch (e) {
    error(`ζειθ――:${e}`);
  }
  options.context!.bundleResult = buildResult;
  return buildResult;
}

export function nodeBundleFile(options: Options) {
  //ζ§θ‘ζεεηζδ»Ά
  const stream = spawn(`node`, [normalize(options.outfile!)], {
    cwd: process.cwd(),
  });

  options.context!.childProcessStream = stream;

  //ηε¬θΎεΊηιθ――δΏ‘ζ―
  stream.stderr.on("data", (chunk) => {
    error(`ε­θΏη¨ιθ――:${chunk.toString()}`);
  });

  //ηε¬ε­θΏη¨θΎεΊηδΏ‘ζ―
  stream.stdout.on("data", (chunk) => {
    console.log(chunk.toString());
  });

  //ε½εΌε―ηθΏη¨ιεΊ
  stream.on("exit", function (code, signal) {
    //ζθ·ε°ιθ――ε―Όθ΄ε­θΏη¨εζ­’ζ§θ‘
    if (code) {
      //TODO
    }
    //ηΆθΏη¨ζζ­»δΊε­θΏη¨
    else if (signal) {
      console.log("π " + chalk.blue(`ζδ»ΆζΉε,ε­θΏη¨ιεΊ...`));
    }
    //ζ­£εΈΈζ§θ‘ε?ζ,ε³ι­ηε¬
    else {
      const cancelWatch = options.context!.cancelWatch;
      Object.keys(cancelWatch).forEach((key) => {
        cancelWatch[key]();
      });
      console.log(chalk.green(`π ζ§θ‘ε?ζ―...`));
    }
    options.context!.childProcessStream = undefined;
  });

  //ζ ζ³εΌε―ε­θΏη¨ εΌε―ε­θΏη¨ε€±θ΄₯η­
  //θΎεΊιθ――
  stream.on("error", function (err) {
    error(err.message);
    err.stack && error(err.stack);
    options.context!.childProcessStream = undefined;
  });
  return;
}
