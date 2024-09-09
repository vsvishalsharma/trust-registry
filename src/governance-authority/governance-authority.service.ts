import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGovernanceAuthorityDto } from './dto/create-governance-authority.dto';
import { OnboardIssuerDto } from './dto/onboard-issuer.dto';
import { OnboardVerifierDto } from './dto/onboard-verifier.dto';
import { AuthorizationStatus, EntityType, Prisma } from '@prisma/client';
import { CreateAssuranceLevelDto } from './dto/create-assurance-level.dto';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { CreateSchemaDto } from './dto/create-schema.dto';

@Injectable()
export class GovernanceAuthorityService {
  constructor(private prisma: PrismaService) {}

  private async fetchW3CSchema(w3cUri: string): Promise<any> {
    const response = await fetch(w3cUri);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  private async resolveSchemaAttributes(w3cUri: string): Promise<string[]> {
    try {
      const jsonSchema = await this.fetchW3CSchema(w3cUri);

      if (!jsonSchema.properties || typeof jsonSchema.properties !== 'object') {
        throw new BadRequestException('Invalid JSON schema: missing or invalid properties');
      }

      return Object.keys(jsonSchema.properties);
    } catch (error) {
      throw new BadRequestException(`Failed to resolve W3C schema: ${error.message}`);
    }
  }

  private async findSchemasAttributes(schemaIds: string[]): Promise<string[]> {
    const schemaAttributes = [];

    for (const schemaId of schemaIds) {
      const schema = await this.prisma.schema.findUnique({ where: { id: schemaId } });

      if (!schema) {
        throw new NotFoundException(`Schema with ID ${schemaId} not found`);
      }

      if (schema.w3cUri) {
        const attributes = await this.resolveSchemaAttributes(schema.w3cUri);
        schemaAttributes.push(...attributes);
      }
    }

    return [...new Set(schemaAttributes)];
  }

  private async validateAttributes(allAttributes: string[], attributesToValidate: string[]): Promise<void> {
    const invalidAttrs = attributesToValidate.filter(attr => !allAttributes.includes(attr));

    if (invalidAttrs.length > 0) {
      throw new BadRequestException(`Invalid attributes: ${invalidAttrs.join(', ')}`);
    }
  }

  async validateVerifierAttributes(schemaIds: string[], attributes: string[]): Promise<void> {
    const allSchemaAttributes = await this.findSchemasAttributes(schemaIds);
    if (allSchemaAttributes.length > 0) {
      await this.validateAttributes(allSchemaAttributes, attributes);
    }
  }

  async createGovernanceAuthority(dto: CreateGovernanceAuthorityDto) {
    return this.prisma.governanceAuthority.create({
      data: { ...dto, relatedAuthorities: dto.relatedAuthorities || [] },
    });
  }

  private async createOrUpdateSchemas(issuerId: string, governanceAuthorityId: string, existingSchemaIds?: string[], newSchemas?: CreateSchemaDto[]): Promise<void> {
    if (existingSchemaIds?.length) {
      await this.prisma.schema.updateMany({
        where: { id: { in: existingSchemaIds } },
        data: { entityId: issuerId },
      });
    }

    if (newSchemas?.length) {
      await this.prisma.schema.createMany({
        data: newSchemas.map(schema => ({
          ...schema,
          entityId: issuerId,
          governanceAuthorityId,
        })),
      });
    }
  }

  async onboardIssuer(dto: OnboardIssuerDto, governanceAuthorityId: string) {
    const issuer = await this.prisma.entity.create({
      data: {
        ...dto,
        type: EntityType.ISSUER,
        governanceAuthorityId,
        authorization: AuthorizationStatus.CURRENT,
      },
      select: this.entitySelectFields(),
    });

    await this.createOrUpdateSchemas(issuer.id, governanceAuthorityId, dto.existingSchemaIds, dto.newSchemas);

    return issuer;
  }

  async onboardVerifier(dto: OnboardVerifierDto, governanceAuthorityId: string) {
    if (dto.schemaIds?.length) {
      await this.validateVerifierAttributes(dto.schemaIds, dto.attributes);
    }

    return this.prisma.entity.create({
      data: {
        ...dto,
        type: EntityType.VERIFIER,
        governanceAuthorityId,
        authorization: AuthorizationStatus.CURRENT,
      },
      select: this.entitySelectFields(),
    });
  }

  async createNamespace(dto: CreateNamespaceDto, governanceAuthorityId: string) {
    return this.prisma.namespace.create({
      data: { ...dto, governanceAuthorityId },
      select: this.namespaceSelectFields(),
    });
  }

  async createAssuranceLevel(dto: CreateAssuranceLevelDto, governanceAuthorityId: string) {
    return this.prisma.assuranceLevel.create({
      data: { ...dto, governanceAuthorityId },
      select: this.assuranceLevelSelectFields(),
    });
  }

  async createSchema(dto: CreateSchemaDto, governanceAuthorityId: string) {
    return this.prisma.schema.create({
      data: { ...dto, governanceAuthorityId, ...(dto.entityId && { entityId: dto.entityId }) },
      select: this.schemaSelectFields(),
    });
  }

  private entitySelectFields() {
    return {
      id: true,
      name: true,
      did: true,
      type: true,
      governanceAuthority: { select: { name: true, did: true } },
      namespace: { select: { name: true } },
      assuranceLevel: { select: { name: true, level: true } },
      authorization: true,
    };
  }

  private namespaceSelectFields() {
    return {
      name: true,
      governanceAuthority: { select: { name: true, did: true } },
    };
  }

  private assuranceLevelSelectFields() {
    return {
      name: true,
      level: true,
      governanceAuthority: { select: { name: true, did: true } },
    };
  }

  private schemaSelectFields() {
    return {
      id: true,
      name: true,
      type: true,
      w3cUri: true,
      anonCredsSchemaId: true,
      entity: { select: { name: true, did: true, type: true } },
    };
  }

  async getSchemasByGovernanceAuthority(governanceAuthorityDid: string) {
    return this.prisma.schema.findMany({
      where: { governanceAuthority: { did: governanceAuthorityDid } },
      select: this.schemaSelectFields(),
    });
  }

  async getNamespaces(registryDid: string) {
    return this.prisma.namespace.findMany({
      where: { governanceAuthority: { did: registryDid } },
      select: this.namespaceSelectFields(),
    });
  }

  async getAssuranceLevels(registryDid: string) {
    return this.prisma.assuranceLevel.findMany({
      where: { governanceAuthority: { did: registryDid } },
      select: this.assuranceLevelSelectFields(),
    });
  }

  async getEntities(registryDid: string, type?: EntityType) {
    return this.prisma.entity.findMany({
      where: { governanceAuthority: { did: registryDid }, ...(type && { type }) },
      select: this.entitySelectFields(),
    });
  }

  private async findGovernanceAuthorityByDid(did: string) {
    return this.prisma.governanceAuthority.findUnique({
      where: { did },
      select: {
        name: true,
        did: true,
        entities: {
          select: {
            name: true,
            did: true,
            type: true,
            namespace: { select: { name: true } },
            assuranceLevel: { select: { level: true, name: true } },
            schemas: { select: { name: true, type: true, w3cUri: true } },
          },
        },
      },
    });
  }

  private async findEntityByDid(did: string, type?: EntityType) {
    const entity = await this.prisma.entity.findUnique({
      where: { did },
      select: {
        name: true,
        did: true,
        type: true,
        governanceAuthority: { select: { name: true, did: true } },
        namespace: { select: { name: true } },
        assuranceLevel: { select: { level: true, name: true } },
        schemas: { select: { name: true, type: true, w3cUri: true } },
      },
    });

    if (entity && type && entity.type !== type) {
      throw new NotFoundException(`Entity with DID ${did} and type ${type} not found`);
    }

    return entity;
  }

  async getDetailsByDid(did: string, type?: EntityType) {
    const governanceAuthority = await this.findGovernanceAuthorityByDid(did);

    if (governanceAuthority) {
      return { type: 'GovernanceAuthority', details: governanceAuthority };
    }

    const entity = await this.findEntityByDid(did, type);

    if (entity) {
      return { type: entity.type, details: entity };
    }

    throw new NotFoundException(`No governance authority or entity found with DID: ${did}`);
  }
  async getEntityAuthorization(entityId: string): Promise<AuthorizationStatus> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { authorization: true },
    });
  
    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }
  
    return entity.authorization;
  }
  async getAllGovernanceDetails() {
    return this.prisma.governanceAuthority.findMany({
      select: {
        name: true,
        did:true,
        entities: {
          select: {
            name: true,
            did: true,
            type: true,
            authorization: true,
            namespace: {
              select: {
                name: true,
              },
            },
            assuranceLevel: {
              select: {
                level: true,
                name: true,
              },
            },
            schemas: {
              select: {
                name: true,
                type: true,
                w3cUri: true,
              },
            },
          },
        },
        namespaces: {
          select: {
            name: true,
            id: true,
          },
        },
        assuranceLevels: {
          select: {
            level: true,
            name: true,
          },
        },
        schemas: {
          select: {
            name: true,
            type: true,
            w3cUri: true,
            anonCredsSchemaId: true,
          },
        },
      },
    });
  }
}
