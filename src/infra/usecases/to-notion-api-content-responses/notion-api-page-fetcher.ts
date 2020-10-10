import { HttpPostClient, HttpResponse } from 'data/protocols/http-post';
import { NotionApiContentResponse } from '../../protocols/notion-api-content-response';
import { NotionPageIdValidator, PageRecordValidator } from './validation';
import { IdNormalizer } from './id-normalizer';

const NOTION_API_PATH = 'https://www.notion.so/api/v3/';

export class NotionApiPageFetcher {
  private readonly _httpPostClient: HttpPostClient;
  private readonly _idNormalizer: IdNormalizer;
  private readonly _notionPageId: string;

  constructor(notionPageId: string | undefined, httpPostClient: HttpPostClient, idNormalizer: IdNormalizer) {
    const pageIdError = new NotionPageIdValidator(notionPageId).validate();
    if (pageIdError) throw pageIdError;

    this._httpPostClient = httpPostClient;
    this._idNormalizer = idNormalizer;
    this._notionPageId = this._idNormalizer.normalizeId(notionPageId || '');
  }

  async getNotionPageContents(): Promise<NotionApiContentResponse[]> {
    const pageRecords = await this._fetchRecordValues();

    const pageRecordError = new PageRecordValidator(this._notionPageId, pageRecords).validate();
    if (pageRecordError) throw pageRecordError;

    const chunk = await this._fetchPageChunk();

    const contentIds = pageRecords.data.results[0].value.content;
    const contents = contentIds
      .filter((id: string) => !!chunk.data.recordMap?.block[id])
      .map((id: string) => chunk.data.recordMap?.block[id].value);

    return contents.map((c: Record<string, any>, index: number) => ({
      id: c.id,
      ...(index === 0 &&
        pageRecords.data.results[0].value.properties && {
          title: pageRecords.data.results[0].value.properties.title[0][0],
        }),
      type: c.type,
      properties: c.properties,
    }));
  }

  private async _fetchRecordValues(): Promise<HttpResponse> {
    return this._httpPostClient.post(NOTION_API_PATH + 'getRecordValues', {
      requests: [
        {
          id: this._notionPageId,
          table: 'block',
        },
      ],
    });
  }

  private async _fetchPageChunk(): Promise<HttpResponse> {
    return this._httpPostClient.post(NOTION_API_PATH + 'loadPageChunk', {
      pageId: this._notionPageId,
      limit: 999999,
      cursor: {
        stack: [],
      },
      chunkNumber: 0,
      verticalColumns: false,
    });
  }
}