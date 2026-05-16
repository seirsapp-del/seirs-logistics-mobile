import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { AddressesService } from './addresses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

class CreateAddressDto {
  @IsString() @MaxLength(64)  label!: string;
  @IsString() @MaxLength(500) text!:  string;
  @IsIn(['home', 'work', 'other']) type!: 'home' | 'work' | 'other';
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

class UpdateAddressDto {
  @IsOptional() @IsString() @MaxLength(64)  label?: string;
  @IsOptional() @IsString() @MaxLength(500) text?:  string;
  @IsOptional() @IsIn(['home', 'work', 'other']) type?: 'home' | 'work' | 'other';
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.addresses.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    return this.addresses.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.addresses.delete(user.id, id);
  }
}
