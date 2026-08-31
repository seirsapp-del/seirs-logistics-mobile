import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmergencyContact } from './emergency-contact.entity';

/**
 * The numbers Nigeria actually answers on.
 *
 * 112 is the national emergency line, routed through the state Emergency
 * Communication Centres, and it is the number to dial when you do not
 * know which service you need. 199 is the fire service. 122 is the FRSC
 * road-safety line.
 *
 * There is deliberately no "Police" row pointing at a single national
 * number, because there is not one: police response runs through 112 or
 * through a state command line that differs by state. The driver app
 * used to show "Police 199", which is the fire service, and a rider in
 * trouble who dialled it reached the wrong people while believing they
 * had reached the right ones.
 *
 * Seeded once. Admin owns the list afterwards, including adding the
 * state lines this cannot know.
 */
export const EMERGENCY_CONTACT_SEED: Array<Partial<EmergencyContact>> = [
  {
    name:        'Emergency (all services)',
    numbers:     ['112'],
    instruction: 'The national emergency line. Dial this first if you are hurt, threatened, or unsure which service you need.',
    category:    'national',
    sortOrder:   10,
  },
  {
    name:        'Fire Service',
    numbers:     ['199'],
    instruction: 'Fire, or a vehicle burning. For anything else use 112.',
    category:    'fire',
    sortOrder:   20,
  },
  {
    name:        'Road Safety (FRSC)',
    numbers:     ['122'],
    instruction: 'Crashes, obstructions and road incidents on a highway.',
    category:    'road',
    sortOrder:   30,
  },
];

@Injectable()
export class EmergencyContactsService {
  private readonly logger = new Logger(EmergencyContactsService.name);

  constructor(
    @InjectRepository(EmergencyContact)
    private readonly repo: Repository<EmergencyContact>,
  ) {}

  /** The live directory, in dial order. Public: the SOS screen has no token. */
  async list(includeInactive = false) {
    const rows = await this.repo.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return {
      items: rows.map((r) => ({
        id:          r.id,
        name:        r.name,
        numbers:     Array.isArray(r.numbers) ? r.numbers : [],
        instruction: r.instruction ?? '',
        category:    r.category ?? undefined,
        sortOrder:   r.sortOrder ?? 0,
        ...(includeInactive ? { isActive: r.isActive } : {}),
      })),
    };
  }

  /**
   * Fill an empty table with the national numbers.
   *
   * Only ever runs when the table is EMPTY. An admin who deletes a row
   * has made a decision, and a seed that reinstated it on every boot
   * would quietly overrule them.
   */
  async seedIfEmpty(): Promise<number> {
    const existing = await this.repo.count();
    if (existing > 0) return 0;
    await this.repo.save(EMERGENCY_CONTACT_SEED.map((c) => this.repo.create(c)));
    this.logger.log(`Seeded ${EMERGENCY_CONTACT_SEED.length} emergency contacts.`);
    return EMERGENCY_CONTACT_SEED.length;
  }

  /** Admin create/update. Numbers are digits, spaces and + only. */
  async upsert(id: string | null, body: Partial<EmergencyContact>) {
    const numbers = Array.isArray(body.numbers)
      ? body.numbers.map((n) => String(n).trim()).filter(Boolean)
      : undefined;

    if (numbers && numbers.some((n) => !/^\+?[0-9][0-9\s-]{1,19}$/.test(n))) {
      throw new BadRequestException(
        'A number must be dialable: digits, spaces or hyphens, optionally starting with +.',
      );
    }
    if (id == null && (!numbers || numbers.length === 0)) {
      throw new BadRequestException('A contact needs at least one number.');
    }
    if (id == null && !String(body.name ?? '').trim()) {
      throw new BadRequestException('A contact needs a name.');
    }

    if (id) {
      const row = await this.repo.findOne({ where: { id } });
      if (!row) throw new NotFoundException('Emergency contact not found.');
      Object.assign(row, {
        ...(body.name        !== undefined ? { name: String(body.name).trim() } : {}),
        ...(numbers          !== undefined ? { numbers } : {}),
        ...(body.instruction !== undefined ? { instruction: String(body.instruction) } : {}),
        ...(body.category    !== undefined ? { category: body.category || null } : {}),
        ...(body.sortOrder   !== undefined ? { sortOrder: Number(body.sortOrder) || 0 } : {}),
        ...(body.isActive    !== undefined ? { isActive: !!body.isActive } : {}),
      });
      return this.repo.save(row);
    }

    return this.repo.save(this.repo.create({
      name:        String(body.name).trim(),
      numbers:     numbers!,
      instruction: String(body.instruction ?? ''),
      category:    body.category || null,
      sortOrder:   Number(body.sortOrder) || 0,
      isActive:    body.isActive === undefined ? true : !!body.isActive,
    }));
  }
}
