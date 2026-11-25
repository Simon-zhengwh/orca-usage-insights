<h1 align="center">
  <img src="images/icon.png" alt="" height="72"><br>
  Usage Insights
</h1>

<h3 align="center">See how much Claude Code, Codex, Pi and OpenCode you actually use, inside Orca.</h3>

<p align="center">
  <a href="#install">Install</a> •
  <a href="#what-you-get">What you get</a> •
  <a href="#request-log">明细</a> •
  <a href="#breakdown">Breakdown</a> •
  <a href="#prices">Prices</a> •
  <a href="#more-machines-and-folders">More machines</a> •
  <a href="#speed">Speed</a> •
  <a href="#privacy">Privacy</a> •
  <a href="https://www.onorca.dev/plugins/Etherll/orca-usage-insights">Plugin page</a>
</p>

<p align="center">
  <img src="images/cover.png" alt="Usage Insights in an Orca window: token totals, a split by provider and machine, and a daily trend" width="900">
</p>

## Install

Install it from the [plugin page](https://www.onorca.dev/plugins/Etherll/orca-usage-insights), or in Orca go to **Settings → Plugins → Add plugin → From a Git URL** and paste `https://github.com/Etherll/orca-usage-insights`. Orca asks you to approve it first, because it reads files on your machine (more on that [below](#privacy)).

Then open it from the bar chart icon in the right sidebar. The status bar shows today's tokens too; hover it for the cost and cache hit rate, or click it to show or hide the sidebar.

Needs Orca 1.4.248 or newer.

## What you get

The panel reads your Claude Code, Codex and Pi transcripts, plus the local OpenCode database, and turns them into (the panel itself is in Chinese):

* **Totals** for today, 7 days, 30 days, 90 days, everything or dates you pick: tokens, estimated cost, today, cache hit rate, sessions and your streak.
* **Daily charts** of tokens or cost, per token type and per provider.
* **A 26-week activity calendar** and a weekday by hour chart of when you work.
* **Rankings** by model, project and machine, and a sortable **Date × model** table with exact input, output and cache token counts.
* **A 明细 (request log) view** of single requests, newest first, with an hour-by-hour chart and the measured output speed in tokens per second ([more below](#request-log)).
* **A Breakdown (拆解) view** that shows what your spend went on, down to the file or command ([more below](#breakdown)).
* **A pixel-art skyline** at the top, drawn from your daily usage. The stars are your streak.

It updates a few seconds after an agent finishes a turn, so the numbers keep up while you work.

**7d** is the default range; **默认范围** in **设置 → 插件 → 用量洞察** changes it. **今日** is the current local day from midnight, not the last 24 hours. **自定义** takes a start and end date (both included, in local time; pick the same date twice for one day). The calendar and streak keep their full history whatever the range.

One **筛选** menu narrows it down: only sessions that ran in an Orca worktree, one provider, one or more models, one machine, or no cache tokens. Turning cache tokens off takes them out of every total, share and chart; the cache read and write counts and the cost stay as recorded. A model selection is a fixed list, so a model that shows up later is only included under **全部模型**.

<table>
  <tr>
    <td><img src="images/screenshot-cost.png" alt="Daily cost, activity calendar, rhythm chart and model breakdown"></td>
    <td><img src="images/screenshot-filters.png" alt="The Filters menu open, with Orca worktrees only selected"></td>
  </tr>
  <tr>
    <td><img src="images/screenshot-activity.png" alt="Light theme: activity calendar, rhythm, breakdown, token mix and projects"></td>
    <td><img src="images/screenshot-sidebar.png" alt="The panel at sidebar width in dark and light themes"></td>
  </tr>
</table>

Cost is an estimate at list API prices, so it's what the same tokens would cost on the API, not your bill. Claude, OpenAI and OpenCode models are priced, per exact model, with long-prompt tiers and 1-hour cache writes, and so are the makers people reach through their own gateway (DeepSeek, Z.ai, Moonshot, Volcengine) ([more below](#prices)). OpenCode model names keep their channel (`opencode/` for Console, `opencode-go/` for Go), since the same model can cost different amounts on each. A model with no price counts toward tokens, and its cost shows as `+`.

## Breakdown (拆解)

Switch the panel to **Breakdown** to see what the money went on. It splits the same total as the Usage view, to the cent, into:

* **Buckets**: session start (system prompt, tools, memory files), tool results, your messages, injected context, earlier replies, compaction summaries, cache rebuilds and output.
* **Where it went**: click from a project into its folders and files, or into its commands (`$ git status`, `$ npm test`), subagents and other tools.
* **Patterns worth a look**: large tool results that stayed in context, the same file read again with no edit in between, and the cache expiring after a break. Each card shows what that pattern cost.

<table>
  <tr>
    <td><img src="images/screenshot-breakdown.png" alt="Breakdown: spend split into buckets, and one project's src folder split by file"></td>
    <td><img src="images/screenshot-patterns.png" alt="Patterns worth a look: a large test output, a file read again, and the cache expiring after a break, each with its cost"></td>
  </tr>
</table>

Each pattern has an **解释** button. It gives you a prompt to paste into Claude Code or Codex. The prompt holds the numbers and a few `node` commands that print short excerpts of the transcripts involved, so your agent can work out the cause and suggest a fix. Reading those excerpts costs your agent a few thousand tokens (the panel shows an estimate), and they go to its model provider like any other file it reads.

<p align="center">
  <img src="images/screenshot-explain.png" alt="The Explain dialog with a prompt for one pattern, ready to copy" width="720">
</p>

`≈` marks a split that is estimated (several tool results in one turn are split by size). Spend that can't be split, such as usage on SSH hosts, in OpenCode or in Pi, is listed under **未分析** with the reason. 拆解 follows the range, custom dates included, but not the model or cache-token filters. The first 拆解 reads the transcripts changed within the range, which takes a few seconds on a big history; after that only new lines are read.

## Request log

The **明细** view lists single requests instead of totals: the local time, model, project, input, output, cache read, estimated cost, and the output speed in tokens per second. Newest first, 100 at a time, with a button for more. It follows the range and every filter, so the same **自定义** dates that narrow the panel to one day turn the log, and the chart above it, into that day. The chart folds the requests into the 24 hours of the local day, or into hour of day across the whole range.

The throughput is what the transcript measured, not a guess: an hour of requests took a known number of milliseconds, and the output tokens written in that time divided by it is the speed. Only Pi records the duration of each request, so only Pi rows, and the hours they fall in, get a speed; Claude Code, Codex and OpenCode count toward tokens and cost as usual, and their speed cell stays empty rather than showing a zero. A row without a duration in a split transcript is the same: tokens counted, no speed.

## Prices

Prices ship with the plugin: Claude and OpenAI from [LiteLLM](https://github.com/BerriAI/litellm), and OpenCode's Console and Go prices plus the model makers (DeepSeek, Z.ai, Moonshot, Volcengine) from [models.dev](https://models.dev). A maker's models are bundled under their bare id, which is what a gateway passes through, so `deepseek-flash` costs the same whether Claude Code or Pi wrote it down. The line at the bottom of the panel says which prices are in use.

**同步价格** fetches the current lists from LiteLLM and [models.dev](https://models.dev) and shows what would change, and by how much for your last 30 days. Only the rows you tick are applied. Rows where the two sources agree come pre-ticked; big jumps and anything odd never are. **撤销** puts the previous prices back, and **Reset** goes back to the bundled ones.

### Your own prices

To set a price yourself, for a discount, a proxy or a model neither list has, create `price-overrides.json` in the plugin's cache folder:

* Linux: `~/.cache/orca-usage-insights/`
* macOS: `~/Library/Caches/orca-usage-insights/`
* Windows: `%LOCALAPPDATA%\orca-usage-insights\`

Prices are USD per million tokens:

```json
{
  "v": 1,
  "models": {
    "claude-opus-5-5": { "output": 18 },
    "my-proxy-model": { "provider": "anthropic", "input": 1, "output": 5, "cacheRead": 0.1, "cacheWrite": { "5m": 1.25, "1h": 2 } }
  },
  "aliases": { "my-proxy-opus": "claude-opus-5-5" }
}
```

The first entry changes one price of a known model, the second adds a new model, and the alias prices a model name as another. A new model needs its `provider` unless its name starts with `claude-`: `anthropic` splits cache writes into `5m` and `1h`, and every other provider (including `openai`, the default) takes one `default` rate. Use an `opencode/` or `opencode-go/` name to set a channel price. Your file always wins over the bundled and synced prices, and Sync, Undo and Reset never change it. The panel picks up edits on the next refresh and lists any line it couldn't use.

## More machines and folders

By default the plugin reads this machine's `~/.claude`, `~/.config/claude`, `~/.codex` and `~/.pi/agent`, plus `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `PI_CODING_AGENT_DIR` when they're set, and every Claude profile and Codex account home Orca manages. A new account shows up on the next scan.

OpenCode 2.x is read from `${XDG_DATA_HOME:-~/.local/share}/opencode/opencode.db` (on Windows, `%USERPROFILE%\.local\share\opencode`, not `%APPDATA%`), or from the file `OPENCODE_DB` names. Channel builds such as `opencode-dev.db` count too, and installs older than 2.x are read from their old tables. The database is opened read-only and only changed messages are read. **Refresh** also drops messages deleted in OpenCode. It needs `node:sqlite` (Node 22.5 or newer, which Orca ships); without it the source shows a warning and everything else still works. SSH hosts don't read OpenCode yet.

Pi sessions are read from `~/.pi/agent/sessions` (or `PI_CODING_AGENT_DIR` when it is set), one JSONL file per session. Each assistant message that reports usage counts once; a session resumed or copied under a new session ID is matched by its response ID. Pi price lists are your own, so a model the public lists know by the same id (such as `deepseek-flash` or `glm-5.3`) is priced, while a gateway-only name still shows under **未分析** with a `+` next to the total until you give it a price.

Histories from all of them are combined. A transcript that several accounts share counts once, and so does a hard link or a copied Codex turn. Codex turns are matched by turn ID and Pi turns by response ID, so a session resumed or copied under a new session ID still counts once. Older Codex logs have no turn IDs and can't be matched across sessions. The transcripts don't say which subscription paid for a turn, so the totals cover all accounts together. The source strip under the filters shows each folder's status, files, turns and latest usage, and a transcript that several folders share is counted in each of them there.

Click a folder there to leave it out, and click it again to count it again. A folder you turn off stays off after a restart; the list is in Settings as **Turned-off transcript folders**. Turning one back on doesn't read its files again.

You can add more in **Settings → Plugins → Usage Insights**, one per line:

**Extra folders**, for a WSL install, a second config folder or an old backup:

```text
\\wsl.localhost\Ubuntu\home\you\.claude
~/backup/.claude
~/backup/.pi/agent
```

**SSH hosts**, to include usage from your other machines. Use a name from `~/.ssh/config` or `user@host`. Add `name = host` to show a short name instead of the address:

```text
devbox
aws = ec2-1-2-3-4.compute.amazonaws.com
```

It uses your own `ssh` with your keys or ssh-agent, and never asks for a password. The other machine needs to be Linux or macOS. The first pull takes a little while on a big history, then only new lines come over. Each source shows its status in the strip under the filters, with the reason if something fails.

Using an Orca server? Install the plugin there too, or add the server as an SSH host to see it here.

The first scan after this update reads every Codex transcript again, so copied turns can be matched. Claude transcripts aren't read again. An offline SSH host shows its Codex history again when it reconnects.

## Speed

Measured on a history of about 5,100 transcripts and 418,000 turns:

* **Opening the panel** takes about 0.3 s, from the cache. The very first open, with no cache, reads everything once in about 2 s.
* **After an agent turn**, only the new lines are read, and only the changed transcript is merged again (a few milliseconds). For OpenCode, only changed messages are queried (about 15 ms on a 50,000-turn database), and a restart doesn't open an unchanged database.
* **拆解** reads every transcript the first time (a few seconds). After that it opens in about 0.2 s; switching back to a view or clicking into a project takes about 30 ms, and a view after new activity is rebuilt in about 0.1 s.
* **明细** sorts the requests in the range each time it opens (about 45 ms for 14,000 of 117,000), then hands back one page. **加载更多** asks again with a bigger offset and gives the next 100.
* **Memory**: the records take about 130 MB, and Breakdown about 50 MB more once opened. The first full read uses up to about 1 GB for a few seconds while it reads in parallel.

The first open after updating reads everything once, like a first install, because the cache now keeps more per turn: 1-hour cache writes, and the measured duration that the 明细 view needs for a speed. The first Breakdown after updating to the OpenCode release reads its transcripts once more, because prompts over 512k tokens now have their own price band.

## Privacy

Your transcripts stay on your machines. The plugin makes no network requests of its own, with two exceptions you start yourself: the SSH connections you add, and **同步价格**, which downloads the public price lists from `raw.githubusercontent.com` (LiteLLM) and `models.dev` when you click it. Nothing about your usage is sent with those requests.

**What it reads:** your Claude Code, Codex and Pi transcripts, including Codex's compressed `.jsonl.zst` files, and your local OpenCode SQLite database. 拆解 does not read OpenCode or Pi yet, so their spend shows under **未分析**.

**What it keeps** in its cache folder, so later opens are fast:

* token counts, times, model names and project folders (for OpenCode, in a file of its own);
* for Breakdown, a small file per transcript (plus one with where to read on from, for transcripts that can grow) with token counts per bucket, file paths (relative to the project or under `~`; any other absolute path keeps at most its first five folders, such as `/usr/lib/node_modules/typescript/lib`, with a user name under `home` or `Users` replaced by `*`), and command families. A command family is the program and, for a few tools like `git` or `npm`, the subcommand (`$ git status`). Arguments are dropped.

It never stores message text, tool output, command arguments or file contents. The Explain prompt only contains numbers, paths and read commands; it is shown for you to copy, and nothing is sent anywhere until you paste it into an agent.

It needs Orca's "full access" because a panel can't read files on its own. The worker does the reading and sends the panel only the finished numbers. It also asks to read your workspace list (for the worktrees filter), its own settings, and when agents finish (to refresh right after a turn).

## Development

Plain Node 24 with no dependencies (Node's built-in zstd needs 23.8 or newer).

```sh
node scripts/build.mjs          # bundle src/panel into panel/index.html (commit it)
node --test tests/*.test.mjs    # tests
orca plugin dev load .          # try it in Orca
```

Installing from a Git URL takes the newest version tag (`vX.Y.Z`), and only falls back to the newest commit when the repository has no tag. So a release is a tag whose name matches `version` in `orca-plugin.json`:

```sh
git tag -a v1.4.0 -m "1.4.0"   # the tag and the manifest version agree
git push origin v1.4.0
```

There's also `scripts/preview.mjs` to render the panel with your own data in a browser (`--breakdown` opens the 拆解 view), `scripts/bench-worker.mjs` to time it, `scripts/prices.mjs` to regenerate the bundled prices from LiteLLM and models.dev price files (`node scripts/prices.mjs <litellm.json> [modelsdev.json] --write`), and `scripts/media/render.mjs`, which makes the images above from made-up demo data.

## License

MIT
