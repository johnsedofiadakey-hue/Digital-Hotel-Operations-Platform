import { MessagePage } from "../../components/MessagePage";

// Outcome E (§4.3).
export default function DeviceLimitPage() {
  return (
    <MessagePage title="Device limit reached">
      <p>
        This stay already has the maximum number of connected devices. Remove one from a
        connected phone, or ask reception to raise the limit.
      </p>
    </MessagePage>
  );
}
