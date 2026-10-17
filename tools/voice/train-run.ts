import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const V5_ROOT = "E:/soft/GPT-SoVITS-v5"
const CONDA_PYTHON = ["E:/soft/conda/Scripts/conda.exe", "run", "-n", "gptsv5", "python"]

function parseArgs(): Record<string, string> {
    const raw = Bun.argv.slice(2)
    const args: Record<string, string> = {}
    for (let i = 0; i < raw.length; i += 1) {
        const match = raw[i].match(/^--([^=]+)(?:=(.*))?$/)
        if (!match) continue
        if (match[2] !== undefined) args[match[1]] = match[2]
        else if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
            args[match[1]] = raw[i + 1]
            i += 1
        } else args[match[1]] = "true"
    }
    return args
}

async function runStep(
    label: string,
    script: string,
    env: Record<string, string>,
    logPath: string,
    extraArgs: string[] = []
): Promise<void> {
    const logFile = Bun.file(logPath)
    const writer = logFile.writer()
    console.log(`[${label}] ${script} ${extraArgs.join(" ")}`)
    const proc = Bun.spawn([...CONDA_PYTHON, "-s", script, ...extraArgs], {
        cwd: V5_ROOT,
        env: { ...process.env, ...env } as Record<string, string>,
        stdout: "pipe",
        stderr: "pipe",
    })
    const pump = async (stream: ReadableStream<Uint8Array>, prefix: string): Promise<void> => {
        const reader = stream.getReader()
        const decoder = new TextDecoder()
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            writer.write(text)
            const lines = text.split("\n").filter(line => /epoch|step|loss|it\//i.test(line))
            if (lines.length) console.log(`[${label}] ${lines[lines.length - 1].slice(-140)}`)
            void prefix
        }
    }
    await Promise.all([pump(proc.stdout, "out"), pump(proc.stderr, "err")])
    const exitCode = await proc.exited
    writer.end()
    if (exitCode !== 0) throw new Error(`${label} 退出码 ${exitCode}，见 ${logPath}`)
}

/**
 * 单角色 v5turbo LoRA 微调全链：1a 文本 → 1b hubert → 1c 语义 → s2 LoRA。
 */
async function main(): Promise<void> {
    const args = parseArgs()
    const exp =
        args.exp ||
        (() => {
            throw new Error("缺少 --exp")
        })()
    const version = args.version ?? "v5turbo"
    const epochs = Number(args.epochs ?? 150)
    const batchSize = Number(args.batch ?? 6)
    const loraRank = Number(args.rank ?? 64)
    const gpu = args.gpu ?? "0"
    const steps = (args.steps ?? "prep,s2").split(",")
    const inpWavDir = path.resolve(args["wav-dir"] ?? `${V5_ROOT}/data-chars/char_Heitao`)
    const inpText = path.resolve(args.list ?? `${inpWavDir}/Heitao.list`)
    const optDir = `${V5_ROOT}/logs/${exp}`
    const logDir = `${V5_ROOT}/logs/${exp}/driver-logs`
    await mkdir(logDir, { recursive: true })

    const baseEnv = {
        exp_name: exp,
        opt_dir: optDir,
        i_part: "0",
        all_parts: "1",
        _CUDA_VISIBLE_DEVICES: gpu,
        is_half: "True",
        PYTHONPATH: `${V5_ROOT};${V5_ROOT}/GPT_SoVITS`,
        bert_pretrained_dir: `${V5_ROOT}/GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large`,
        cnhubert_base_dir: `${V5_ROOT}/GPT_SoVITS/pretrained_models/chinese-hubert-base`,
        inp_text: inpText,
        inp_wav_dir: inpWavDir,
    }

    if (steps.includes("prep")) {
        await runStep("1a-text", "GPT_SoVITS/prepare_datasets/1-get-text.py", baseEnv, `${logDir}/1a.log`)
        const partPath = `${optDir}/2-name2text-0.txt`
        await writeFile(`${optDir}/2-name2text.txt`, await readFile(partPath, "utf8"))
        await runStep("1b-hubert", "GPT_SoVITS/prepare_datasets/2-get-hubert-wav32k.py", baseEnv, `${logDir}/1b.log`)
        await runStep(
            "1c-semantic",
            "GPT_SoVITS/prepare_datasets/3-get-semantic.py",
            {
                ...baseEnv,
                pretrained_s2G: `${V5_ROOT}/GPT_SoVITS/pretrained_models/gsv-v5-pretrained/s2Gv5turbo.pth`,
                s2config_path: `${V5_ROOT}/GPT_SoVITS/configs/s2.json`,
            },
            `${logDir}/1c.log`
        )
        const partTsv = `${optDir}/6-name2semantic-0.tsv`
        const tsvLines = (await readFile(partTsv, "utf8")).trim().split("\n")
        await writeFile(`${optDir}/6-name2semantic.tsv`, `item_name\tsemantic_audio\n${tsvLines.join("\n")}\n`)
    }

    if (steps.includes("s2")) {
        const s2Template = JSON.parse(await readFile(`${V5_ROOT}/GPT_SoVITS/configs/s2.json`, "utf8"))
        s2Template.train.batch_size = batchSize
        s2Template.train.epochs = epochs
        s2Template.train.lora_rank = loraRank
        s2Template.train.pretrained_s2G = `${V5_ROOT}/GPT_SoVITS/pretrained_models/gsv-v5-pretrained/s2Gv5turbo.pth`
        s2Template.train.pretrained_s2D = ""
        s2Template.train.if_save_latest = true
        s2Template.train.if_save_every_weights = true
        s2Template.train.save_every_epoch = 25
        s2Template.train.gpu_numbers = gpu
        s2Template.model.version = version
        s2Template.data.exp_dir = s2Template.s2_ckpt_dir = optDir
        s2Template.save_weight_dir = `${V5_ROOT}/SoVITS_weights_v5turbo`
        s2Template.name = exp
        s2Template.version = version
        const tmpConfig = `${V5_ROOT}/TEMP/tmp_s2_${exp}.json`
        await mkdir(path.dirname(tmpConfig), { recursive: true })
        await writeFile(tmpConfig, JSON.stringify(s2Template))
        await runStep("s2-lora", "GPT_SoVITS/s2_train_v3_lora.py", { ...baseEnv, CUDA_VISIBLE_DEVICES: gpu }, `${logDir}/s2.log`, [
            "--config",
            tmpConfig,
        ])
    }

    const weightDir = `${optDir}/logs_s2_${version}_lora_${loraRank}`
    try {
        const files = (await readdir(weightDir)).filter(name => name.endsWith(".pth")).sort()
        console.log(`done exp=${exp} weights=${weightDir}/${files[files.length - 1] ?? "(none)"}`)
    } catch {
        console.log(`done exp=${exp} (weight dir pending)`)
    }
}

if (import.meta.main) {
    await main()
}
