import { Probot } from "probot";

// 加载目标仓库内的配置文件
async function getConfig(context: any) {
  return context.config("mooncake-bot.yml", {
    greeting: {
      issue: true,
      pr: true,
    },
    labels: {
      triage: "needs-triage",
      reviewed: "needs-review",
    },
    stale: {
      daysUntilStale: 60,
      daysUntilClose: 7,
    },
    maintainers: ["stmatengss"],
  });
}

export default (app: Probot) => {

  // ── 新 Issue 开启 ──────────────────────────────────
  app.on("issues.opened", async (context) => {
    const config = await getConfig(context);
    if (!config.greeting.issue) return;

    const sender = context.payload.sender.login;
    const isBot = context.payload.sender.type === "Bot";
    if (isBot) return;

    // 检查是否首次提 issue
    const { data: allIssues } = await context.octokit.issues.listForRepo({
      ...context.repo(),
      creator: sender,
      state: "all",
    });
    const isFirstTime = allIssues.length === 1;

    const body = isFirstTime
      ? `👋 Hi @${sender}, welcome to Mooncake — thanks for your first issue!\n\n` +
        `> 🤖 A maintainer will review this shortly.\n\n` +
        `**Checklist:**\n` +
        `- [ ] Checked for duplicate issues\n` +
        `- [ ] Included environment details (Python version, GPU, etc.)\n` +
        `- [ ] Included reproduction steps or logs`
      : `👋 Thanks for the issue, @${sender}! A maintainer will take a look soon.\n\n> 🤖 mooncake-bot`;

    await context.octokit.issues.createComment(context.issue({ body }));

    // 自动打标签
    await context.octokit.issues.addLabels(
      context.issue({ labels: [config.labels.triage] })
    );
  });

  // ── PR 开启 ────────────────────────────────────────
  app.on(["pull_request.opened", "pull_request.ready_for_review"], async (context) => {
    const config = await getConfig(context);
    if (!config.greeting.pr) return;

    const sender = context.payload.sender.login;
    const prNumber = context.payload.pull_request.number;

    await context.octokit.issues.createComment({
      ...context.repo(),
      issue_number: prNumber,
      body:
        `🎉 Thanks for the PR, @${sender}!\n\n` +
        `> 🤖 Maintainers have been notified.\n\n` +
        `**PR Checklist:**\n` +
        `- [ ] Tests added / updated\n` +
        `- [ ] Documentation updated\n` +
        `- [ ] Ran \`pre-commit\` hooks locally`,
    });

    await context.octokit.issues.addLabels({
      ...context.repo(),
      issue_number: prNumber,
      labels: [config.labels.reviewed],
    });
  });

  // ── /label 命令（maintainer 在评论中输入） ─────────
  app.on("issue_comment.created", async (context) => {
    const config = await getConfig(context);
    const body = context.payload.comment.body.trim();
    const sender = context.payload.comment.user.login;

    // 只允许 maintainer 执行命令
    const isMaintainer = config.maintainers.includes(sender);
    if (!isMaintainer) return;

    // /label bug, enhancement
    const labelMatch = body.match(/^\/label\s+(.+)/);
    if (labelMatch) {
      const labels = labelMatch[1].split(",").map((l: string) => l.trim());
      await context.octokit.issues.addLabels(
        context.issue({ labels })
      );
    }

    // /close
    if (body === "/close") {
      await context.octokit.issues.update(
        context.issue({ state: "closed" })
      );
    }

    // /assign @username
    const assignMatch = body.match(/^\/assign\s+@?(\S+)/);
    if (assignMatch) {
      await context.octokit.issues.addAssignees(
        context.issue({ assignees: [assignMatch[1]] })
      );
    }
  });

};
