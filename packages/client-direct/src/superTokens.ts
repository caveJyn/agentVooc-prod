import supertokens from "supertokens-node";
import { elizaLogger } from "@elizaos/core";



elizaLogger.debug(
    `SuperTokens initialized with apiDomain: ${process.env.ST_SERVER_BASE_URL}, ` +
    `websiteDomain: ${process.env.WEBSITE_DOMAIN}, ` +
    `apiBasePath: /api/auth`
);
// console.log(`SuperTokens initialized with apiDomain: ${process.env.ST_SERVER_BASE_URL}, apiBasePath: /api/auth`);


export default supertokens;