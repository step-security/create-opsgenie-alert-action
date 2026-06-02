const core = require("@actions/core");
const fs = require("fs");
const axios = require("axios");
const opsgenie = require("opsgenie-sdk");
const { connectionOptions } = require("./src/connection");
const { createAlertRequestFrom } = require("./src/alert");

async function validateSubscription() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let repoPrivate;

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = eventData?.repository?.private;
  }

  const upstream = "rockem/create-opsgenie-alert-action";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body = { action: action || "" };
  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(
          '\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m'
      );
      core.error(
          `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

const allInputs = () => {
  const inputs = {};
  for (let [k, v] of Object.entries(process.env)) {
    if (k.startsWith("INPUT_")) {
      inputs[k.toLowerCase().substring(6)] = v;
    }
  }
  return inputs;
};

async function main() {
  await validateSubscription();

  opsgenie.configure(
    connectionOptions(core.getInput("api_key"), core.getInput("using_eu_url")),
  );

  const alertRequest = createAlertRequestFrom(allInputs());

  const { api_key: _redacted, ...loggableRequest } = alertRequest;
  console.log(`Creating alert with: ${JSON.stringify(loggableRequest)}`);

  opsgenie.alertV2.create(alertRequest, function (error, result) {
    if (error) {
      core.setFailed(error.message);
    } else {
      console.log(`Request sent for creating new alert: ${result.requestId}`);
      core.setOutput("request_id", result.requestId);
    }
  });
}

main();
