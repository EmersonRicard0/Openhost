//go:build !windows

package updater

import "syscall"

func diskFreeSpace(path string) (uint64, error) {
	var status syscall.Statfs_t
	if err := syscall.Statfs(path, &status); err != nil {
		return 0, err
	}
	if status.Bavail <= 0 || status.Bsize <= 0 {
		return 0, nil
	}
	return uint64(status.Bavail) * uint64(status.Bsize), nil
}
