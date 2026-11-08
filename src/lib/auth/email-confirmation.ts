type ConfirmationClient = {
  auth: {
    verifyOtp(input: { token_hash: string; type: 'email' | 'recovery' }): Promise<{ error: unknown }>;
  };
};

// Only support the two email actions exposed by our templates. The destination
// follows the verified action rather than a user-controlled redirect parameter.
export async function confirmEmailToken(params: URLSearchParams, client: ConfirmationClient) {
  const token = params.get('token_hash');
  const type = params.get('type');
  if (!token || !/^[a-f0-9]{64}$/i.test(token) || (type !== 'email' && type !== 'recovery')) return null;
  const { error } = await client.auth.verifyOtp({ token_hash: token, type });
  if (error) return null;
  return type === 'recovery' ? '/reset-password' : '/verify-email?verified=1';
}
