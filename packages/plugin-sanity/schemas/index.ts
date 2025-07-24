import character from "./character";
import knowledge from "./knowledge";
import User from "./user";
import item from "./item";
import webhookError from "./webhookError";
import landingPage from "./landingPage";
import emailTemplate from "./emailTemplate";
import characterPreset from "./characterPreset";
import legalDocuments from "./legalDocuments";
import companyPage from "./companyPage";
import blogPost from "./blogPost";
import pressPost from "./pressPost";
import productPages from "./productPages";
import invoice from "./invoice";

export const schemaTypes = [
  character,
  characterPreset,
  knowledge,
  User,
  item,
  webhookError,
  landingPage,
  emailTemplate,
  legalDocuments,
  companyPage,
  blogPost,
  pressPost,
  productPages,
  invoice
];

export default schemaTypes;
