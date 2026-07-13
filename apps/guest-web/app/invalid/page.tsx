import { MessagePage } from "../../components/MessagePage";

// Outcome D (§4.3). Deliberately vague — never confirm or deny what the
// scanned code was supposed to be.
export default function InvalidPage() {
  return (
    <MessagePage title="Code not recognized">
      <p>Please contact the front desk for help.</p>
    </MessagePage>
  );
}
