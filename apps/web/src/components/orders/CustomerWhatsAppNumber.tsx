import { useQueryClient } from '@tanstack/react-query';
import { useUpdateCustomer } from '../../api/customers.js';
import { WhatsAppNumberEditor } from '../common/WhatsAppNumberEditor.js';

interface Props {
  customerId: string | null;
  mobile: string | null;
  needsReview?: boolean;
}

/**
 * Customer WhatsApp number on the order screen: shows it formatted, flags
 * numbers automations can't use, and lets staff correct it in place.
 */
export function CustomerWhatsAppNumber({ customerId, mobile, needsReview = false }: Props) {
  const queryClient = useQueryClient();
  const updateCustomer = useUpdateCustomer();

  return (
    <WhatsAppNumberEditor
      value={mobile}
      needsReview={needsReview}
      helperText="Updates the customer and their linked bookings so reminders reach them."
      onSave={customerId
        ? async (next) => {
            await updateCustomer.mutateAsync({ id: customerId, mobile: next });
            void queryClient.invalidateQueries({ queryKey: ['orders'] });
          }
        : undefined}
    />
  );
}
