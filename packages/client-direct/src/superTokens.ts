import supertokens from "supertokens-node";
import { backendConfig } from "./config/backendConfig";
import { elizaLogger } from "@elizaos/core";

// Initialize SuperTokens using backendConfig
supertokens.init(backendConfig());

elizaLogger.debug(
    `SuperTokens initialized with apiDomain: ${process.env.ST_SERVER_BASE_URL}, ` +
    `websiteDomain: ${process.env.WEBSITE_DOMAIN}, ` +
    `apiBasePath: /api/auth`
);
// console.log(`SuperTokens initialized with apiDomain: ${process.env.ST_SERVER_BASE_URL}, apiBasePath: /api/auth`);


export default supertokens;