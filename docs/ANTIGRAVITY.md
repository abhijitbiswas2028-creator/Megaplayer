# Antigravity automatic execution

Start Antigravity in this project with automatic tool approval:

```bash
npm run antigravity
```

Continue the last conversation:

```bash
npm run antigravity -- --continue
```

Start with a task:

```bash
npm run antigravity -- --prompt-interactive "Check the video player and fix playback issues"
```

The launcher runs `agy --mode auto --dangerously-skip-permissions` from the project directory. The explicit permission flag auto-approves tool requests, including potentially destructive commands. Ordinary Auto mode alone can still request approval. This applies only to Antigravity sessions started with this launcher; it does not edit global settings or change Codex permissions. Login and operating-system permission dialogs may still require interaction.

For the Antigravity desktop app, choose **Settings → Projects → Megaplayer → Permission Preset → Turbo** to enable its equivalent no-prompt preset for this project. Choose **Auto** instead if you want approval for risky actions. The CLI launcher does not change desktop settings.

Requires the Antigravity CLI (`agy`) on PATH. Verified against the installed CLI's `--help` output and [official Antigravity agent settings](https://antigravity.google/docs/agent-settings).
