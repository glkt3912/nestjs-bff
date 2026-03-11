import { GenericApiAdapter } from './generic-api.adapter';

describe('GenericApiAdapter', () => {
  type Item = { id: number; name: string };
  type CreateBody = { name: string };

  let listFn: jest.Mock;
  let getFn: jest.Mock;
  let createFn: jest.Mock;
  let adapter: GenericApiAdapter<Item, CreateBody>;

  beforeEach(() => {
    listFn = jest.fn();
    getFn = jest.fn();
    createFn = jest.fn();
    adapter = new GenericApiAdapter(listFn, getFn, createFn);
  });

  describe('findAll()', () => {
    it('listFn の data を返す', async () => {
      const items: Item[] = [{ id: 1, name: 'Alice' }];
      listFn.mockResolvedValue({ data: items });

      const result = await adapter.findAll();

      expect(result).toEqual(items);
    });

    it('listFn を1回呼び出す', async () => {
      listFn.mockResolvedValue({ data: [] });

      await adapter.findAll();

      expect(listFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById()', () => {
    it('getFn の data を返す', async () => {
      const item: Item = { id: 42, name: 'Bob' };
      getFn.mockResolvedValue({ data: item });

      const result = await adapter.findById(42);

      expect(result).toEqual(item);
    });

    it('getFn に id を渡す', async () => {
      getFn.mockResolvedValue({ data: { id: 99, name: 'Carol' } });

      await adapter.findById(99);

      expect(getFn).toHaveBeenCalledWith(99);
    });
  });

  describe('create()', () => {
    it('createFn の data を返す', async () => {
      const item: Item = { id: 1, name: 'Dave' };
      createFn.mockResolvedValue({ data: item });

      const result = await adapter.create({ name: 'Dave' });

      expect(result).toEqual(item);
    });

    it('createFn に body を渡す', async () => {
      const body: CreateBody = { name: 'Eve' };
      createFn.mockResolvedValue({ data: { id: 2, name: 'Eve' } });

      await adapter.create(body);

      expect(createFn).toHaveBeenCalledWith(body);
    });
  });
});
