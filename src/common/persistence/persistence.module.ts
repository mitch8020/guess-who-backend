import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PERSISTENCE_MODELS } from '../schemas/persistence.schemas';
import { GridFsService } from './gridfs.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature(PERSISTENCE_MODELS)],
  providers: [GridFsService],
  exports: [MongooseModule, GridFsService],
})
export class PersistenceModule {}
