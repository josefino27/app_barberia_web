export interface User {
    id?: string;
    name: string;
    photoUrl: string;
    email: string;
    phone: string;
    role: string;
    barberName?: string;
    isSubscribed
    : boolean;
}
