import { IsIn, IsOptional, IsString } from 'class-validator';

export class SocialLoginDto {
  @IsString()
  idToken: string;

  /**
   * Which app is asking (founder 2026-09-05).
   *
   * Absent means the customer app, which is the behaviour this endpoint
   * has always had: an unknown Google address becomes a new CUSTOMER
   * account and is signed straight in.
   *
   * That is exactly wrong for the other two. A driver's signup also
   * creates a Driver row, and a business signup a BusinessAccount, so a
   * social button there cannot register anybody: it would produce an
   * account with no vehicle, no licence and no company, sitting in an app
   * built around having them. Worse, the customer path would file that
   * person as a CUSTOMER and sign them into the driver app.
   *
   * So 'driver' and 'business' mean SIGN IN ONLY: the account must
   * already exist and already be that kind. Registration stays the full
   * form.
   */
  @IsOptional()
  @IsIn(['customer', 'driver', 'business'])
  role?: 'customer' | 'driver' | 'business';
}
