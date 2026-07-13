import { MessagePage } from "../../components/MessagePage";

// Outcome C (§4.3).
export default function OutOfOrderPage() {
  return (
    <MessagePage title="This room is out of service">
      <p>Please contact the front desk and we&apos;ll get you sorted.</p>
    </MessagePage>
  );
}
