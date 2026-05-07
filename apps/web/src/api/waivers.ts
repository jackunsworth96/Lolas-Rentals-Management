import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client.js';

export interface SignedWaiverDetails {
  driverName: string;
  driverEmail: string | null;
  driverMobile: string | null;
  agreedAt: string;
  driverSignatureUrl: string | null;
  passengerSignatures: string[];
  licenceFrontUrl: string | null;
  licenceBackUrl: string | null;
  referralSource: string | null;
  referralDetail: string | null;
}

export function useSignedWaiverDetails(orderReference: string | null | undefined, enabled: boolean) {
  return useQuery<SignedWaiverDetails>({
    queryKey: ['waiver', 'signed-details', orderReference],
    queryFn: () => api.get<SignedWaiverDetails>(`/waiver/signed-details/${encodeURIComponent(orderReference!)}`),
    enabled: !!orderReference && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useResendWaiverConfirmation() {
  return useMutation({
    mutationFn: (orderReference: string) =>
      api.post<{ sentTo: string }>('/waiver/resend-confirmation', { orderReference }),
  });
}
