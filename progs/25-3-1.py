from fnmatch import *
for n in range(0,10**10,2024):
    if fnmatch(str(n), '1*2322?2'):
        print(n,n//2024)