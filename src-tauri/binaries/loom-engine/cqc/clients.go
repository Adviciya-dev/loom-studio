package cqc

import "errors"

func ListClients(projectPath string) ([]Client, error) {
	return readClients(projectPath)
}

func SaveClient(projectPath string, c Client) (Client, error) {
	clients, err := readClients(projectPath)
	if err != nil {
		return Client{}, err
	}
	if c.Name == "" {
		return Client{}, errors.New("client name is required")
	}
	if c.ID == "" {
		c.ID = uuidv4()
		c.CreatedAt = nowISO()
		clients = append(clients, c)
	} else {
		found := false
		for i, existing := range clients {
			if existing.ID == c.ID {
				clients[i] = c
				found = true
				break
			}
		}
		if !found {
			clients = append(clients, c)
		}
	}
	if err := writeClients(projectPath, clients); err != nil {
		return Client{}, err
	}
	return c, nil
}

func DeleteClient(projectPath, id string) error {
	clients, err := readClients(projectPath)
	if err != nil {
		return err
	}
	filtered := clients[:0]
	for _, c := range clients {
		if c.ID != id {
			filtered = append(filtered, c)
		}
	}
	return writeClients(projectPath, filtered)
}
