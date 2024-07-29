
import { Injectable, NotFoundException,BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGovernanceAuthorityDto } from './dto/create-governance-authority.dto';
import { OnboardIssuerDto } from './dto/onboard-issuer.dto';
import { OnboardVerifierDto } from './dto/onboard-verifier.dto';
import { OrganizationType } from '@prisma/client';
import { CreateAssuranceLevelDto } from './dto/create-assurance-level.dto';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { CreateSchemaDto } from './dto/create-schema.dto';
@Injectable()
export class GovernanceAuthorityService {
  constructor(private prisma: PrismaService) {}

  async resolveSchemaAttributes(w3cUri: string): Promise<string[]> {
    try {
      const response = await fetch(w3cUri);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonSchema = await response.json();
      
      if (!jsonSchema.properties || typeof jsonSchema.properties !== 'object') {
        throw new BadRequestException('Invalid JSON schema: missing or invalid properties');
      }

      return Object.keys(jsonSchema.properties);
    } catch (error) {
      throw new BadRequestException(`Failed to resolve W3C schema: ${error.message}`);
    }
  }

  async validateVerifierAttributes(schemaIds: string[], attributes: string[]): Promise<void> {
    let allSchemaAttributes: string[] = [];

    for (const schemaId of schemaIds) {
      const schema = await this.prisma.schema.findUnique({
        where: { id: schemaId },
      });

      if (!schema) {
        throw new NotFoundException(`Schema with ID ${schemaId} not found`);
      }

      if (schema.w3cUri) {
        const schemaAttributes = await this.resolveSchemaAttributes(schema.w3cUri);
        allSchemaAttributes = [...allSchemaAttributes, ...schemaAttributes];
      }
    }

    // Remove duplicates from allSchemaAttributes
    allSchemaAttributes = [...new Set(allSchemaAttributes)];

    // Only validate attributes if we have W3C schemas
    // WIP anoncreds
    if (allSchemaAttributes.length > 0) {
      const invalidAttrs = attributes.filter(attr => !allSchemaAttributes.includes(attr));

      if (invalidAttrs.length > 0) {
        throw new BadRequestException(`Invalid attributes: ${invalidAttrs.join(', ')}`);
      }
    }
  }


  async createGovernanceAuthority(dto: CreateGovernanceAuthorityDto) {
    return this.prisma.governanceAuthority.create({
      data: {
        name: dto.name,
        did: dto.did,
      },
    });
  }

  async onboardIssuer(dto: OnboardIssuerDto, governanceAuthorityId: string) {
    const issuer = await this.prisma.organization.create({
      data: {
        name: dto.name,
        did: dto.did,
        type: OrganizationType.ISSUER,
        governanceAuthorityId: governanceAuthorityId,
        namespaceId: dto.namespaceId,
        assuranceLevelId: dto.assuranceLevelId,
      },
    });

    // Map existing schemas to the issuer
    if (dto.existingSchemaIds && dto.existingSchemaIds.length > 0) {
      await this.prisma.schema.updateMany({
        where: { id: { in: dto.existingSchemaIds } },
        data: { organizationId: issuer.id },
      });
    }

    // Create new schemas for the issuer if provided
    if (dto.newSchemas && dto.newSchemas.length > 0) {
      await this.prisma.schema.createMany({
        data: dto.newSchemas.map(schema => ({
          name: schema.name,
          type: schema.type,
          w3cUri: schema.w3cUri,
          anonCredsDefinitionId: schema.anonCredsSchemaId,
          organizationId: issuer.id,
          governanceAuthorityId: governanceAuthorityId,
        })),
      });
    }

    return issuer;
  }


  async onboardVerifier(dto: OnboardVerifierDto, governanceAuthorityId: string) {
    if (dto.schemaIds && dto.schemaIds.length > 0) {
      await this.validateVerifierAttributes(dto.schemaIds, dto.attributes);
    }

    const verifier = await this.prisma.organization.create({
      data: {
        name: dto.name,
        did: dto.did,
        type: OrganizationType.VERIFIER,
        governanceAuthorityId: governanceAuthorityId,
        namespaceId: dto.namespaceId,
        assuranceLevelId: dto.assuranceLevelId,
        attributes: dto.attributes,
      },
    });

    return verifier;
  }

  async createNamespace(dto: CreateNamespaceDto, governanceAuthorityId: string) {
    return this.prisma.namespace.create({
      data: {
        name: dto.name,
        governanceAuthorityId: governanceAuthorityId,
      },
    });
  }

  async createAssuranceLevel(dto: CreateAssuranceLevelDto, governanceAuthorityId: string) {
    return this.prisma.assuranceLevel.create({
      data: {
        name: dto.name,
        level: dto.level,
        governanceAuthorityId: governanceAuthorityId,
      },
    });
  }

  async createSchema(dto: CreateSchemaDto, governanceAuthorityId: string) {
    const { organizationId, ...schemaData } = dto;

    return this.prisma.schema.create({
      data: {
        ...schemaData,
        governanceAuthorityId,
        ...(organizationId && { organizationId }),
      },
    });
  }

  async getSchemasByGovernanceAuthority(governanceAuthorityId: string) {
    return this.prisma.schema.findMany({
      where: {
        governanceAuthorityId,
      },
      include: {
        organization: true,
      },
    });
  }
  async getNamespaces(registryId: string) {
    return this.prisma.namespace.findMany({
      where: {
        governanceAuthorityId: registryId,
      },
    });
  }

  async getAssuranceLevels(registryId: string) {
    return this.prisma.assuranceLevel.findMany({
      where: {
        governanceAuthorityId: registryId,
      },
    });
  }

  async getIssuers(registryId: string) {
    return this.prisma.organization.findMany({
      where: {
        governanceAuthorityId: registryId,
        type: 'ISSUER',
      },
    });
  }

  async getVerifiers(registryId: string) {
    return this.prisma.organization.findMany({
      where: {
        governanceAuthorityId: registryId,
        type: 'VERIFIER',
      },
    });
  }

  async getEntity(entityId: string) {
    const entity = await this.prisma.organization.findUnique({
      where: { id: entityId },
      include: {
        governanceAuthority: true,
        namespace: true,
        assuranceLevel: true,
        schemas: true,
      },
    });

    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    return entity;
  }

  async getEntityAuthorizations(entityId: string) {
    // This is still a placeholder. Implement based on your authorization model
    const entity = await this.prisma.organization.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    return {
      entityId: entity.id,
      authorizations: [],
    };
  }
  
}