export enum Role {
  ADMINISTRATEUR = 'ADMINISTRATEUR',
  RESPONSABLE_RSE = 'RESPONSABLE_RSE',
  CONTRIBUTEUR = 'CONTRIBUTEUR',
  AUDITEUR = 'AUDITEUR',
  DIRECTION = 'DIRECTION'
}

export interface User {
  id?: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status?: string;
}