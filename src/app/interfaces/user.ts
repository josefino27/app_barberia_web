export interface User {
    id?: string;
    name: string;
    photoUrl: string;
    email: string;
    phone?: number;
    role: string;
    barberId?: string;
    barberName?: string;
    isSubscribed
    : boolean;
}
