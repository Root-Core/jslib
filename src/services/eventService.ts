import { EventType } from '../enums/eventType';

import { EventData } from '../models/data/eventData';

import { EventRequest } from '../models/request/eventRequest';

import { ApiService } from '../abstractions/api.service';
import { CipherService } from '../abstractions/cipher.service';
import { EventService as EventServiceAbstraction } from '../abstractions/event.service';
import { StorageService } from '../abstractions/storage.service';
import { UserService } from '../abstractions/user.service';

import { ConstantsService } from './constants.service';

export class EventService implements EventServiceAbstraction {
    private inited = false;

    constructor(private storageService: StorageService, private apiService: ApiService,
        private userService: UserService, private cipherService: CipherService) { }

    init(checkOnInterval: boolean) {
        if (this.inited) {
            return;
        }

        this.inited = true;
        if (checkOnInterval) {
            this.uploadEvents();
            setInterval(() => this.uploadEvents(), 60 * 1000); // check every 60 seconds
        }
    }

    async collect(eventType: EventType, cipherId: string = null, uploadImmediately = false): Promise<any> {
        const organizations = await this.userService.getAllOrganizations();
        if (organizations == null) {
            return;
        }
        const orgIds = new Set<string>(organizations.filter((o) => o.useEvents).map((o) => o.id));
        if (orgIds.size === 0) {
            return;
        }
        if (cipherId != null) {
            const cipher = await this.cipherService.get(cipherId);
            if (cipher == null || cipher.organizationId == null || !orgIds.has(cipher.organizationId)) {
                return;
            }
        }
        let eventCollection = await this.storageService.get<EventData[]>(ConstantsService.eventCollectionKey);
        if (eventCollection == null) {
            eventCollection = [];
        }
        const event = new EventData();
        event.type = eventType;
        event.cipherId = cipherId;
        eventCollection.push(event);
        await this.storageService.save(ConstantsService.eventCollectionKey, eventCollection);
        if (uploadImmediately) {
            await this.uploadEvents();
        }
    }

    async uploadEvents(): Promise<any> {
        const eventCollection = await this.storageService.get<EventData[]>(ConstantsService.eventCollectionKey);
        if (eventCollection == null || eventCollection.length === 0) {
            return;
        }
        const request = eventCollection.map((e) => {
            const req = new EventRequest();
            req.type = e.type;
            req.cipherId = e.cipherId;
            return req;
        });
        try {
            await this.apiService.postEventsCollectMany(request);
            await this.storageService.remove(ConstantsService.eventCollectionKey);
        } catch { }
    }
}