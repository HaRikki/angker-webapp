import { TicketDetail } from "@/components/TicketsView";
export default function Page({ params }: { params: { id: string } }) { return <TicketDetail id={params.id} />; }
