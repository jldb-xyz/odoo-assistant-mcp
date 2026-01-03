import type { Domain, IOdooClient } from "../types/index.js";

export interface ResourceResult {
  [key: string]: unknown;
  contents: Array<{
    uri: string;
    mimeType?: string;
    text: string;
  }>;
}

/**
 * odoo://models - List all models
 */
export async function handleModelsResource(
  client: IOdooClient,
): Promise<ResourceResult> {
  const models = await client.getModels();

  return {
    contents: [
      {
        uri: "odoo://models",
        mimeType: "application/json",
        text: JSON.stringify(models, null, 2),
      },
    ],
  };
}

/**
 * odoo://model/{model_name} - Model info with fields
 */
export async function handleModelResource(
  client: IOdooClient,
  modelName: string,
): Promise<ResourceResult> {
  try {
    const modelInfo = await client.getModelInfo(modelName);

    if ("error" in modelInfo) {
      return {
        contents: [
          {
            uri: `odoo://model/${modelName}`,
            mimeType: "application/json",
            text: JSON.stringify(modelInfo, null, 2),
          },
        ],
      };
    }

    const fields = await client.getModelFields(modelName);
    const result = { ...modelInfo, fields };

    return {
      contents: [
        {
          uri: `odoo://model/${modelName}`,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri: `odoo://model/${modelName}`,
          mimeType: "application/json",
          text: JSON.stringify({ error: String(error) }, null, 2),
        },
      ],
    };
  }
}

/**
 * odoo://record/{model_name}/{record_id} - Single record
 */
export async function handleRecordResource(
  client: IOdooClient,
  modelName: string,
  recordId: string,
): Promise<ResourceResult> {
  try {
    const id = parseInt(recordId, 10);
    if (Number.isNaN(id)) {
      throw new Error(`Invalid record ID: ${recordId}`);
    }

    const records = await client.readRecords(modelName, [id]);

    if (!records.length) {
      return {
        contents: [
          {
            uri: `odoo://record/${modelName}/${recordId}`,
            mimeType: "application/json",
            text: JSON.stringify(
              { error: `Record not found: ${modelName} ID ${recordId}` },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: `odoo://record/${modelName}/${recordId}`,
          mimeType: "application/json",
          text: JSON.stringify(records[0], null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri: `odoo://record/${modelName}/${recordId}`,
          mimeType: "application/json",
          text: JSON.stringify({ error: String(error) }, null, 2),
        },
      ],
    };
  }
}

/**
 * odoo://search/{model_name}/{domain} - Search records
 */
export async function handleSearchResource(
  client: IOdooClient,
  modelName: string,
  domainStr: string,
): Promise<ResourceResult> {
  try {
    const domain = JSON.parse(decodeURIComponent(domainStr)) as Domain;
    const results = await client.searchRead(modelName, domain, { limit: 10 });

    return {
      contents: [
        {
          uri: `odoo://search/${modelName}/${domainStr}`,
          mimeType: "application/json",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      contents: [
        {
          uri: `odoo://search/${modelName}/${domainStr}`,
          mimeType: "application/json",
          text: JSON.stringify({ error: String(error) }, null, 2),
        },
      ],
    };
  }
}
