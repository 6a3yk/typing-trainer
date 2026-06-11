k = 0
for s in open('9.txt'):
    k += 1
    nums = [int(n) for n in s.split()]
    pov2 = [n for n in nums if nums.count(n)==2]
    nepov = [n for n in nums if nums.count(n)==1]
    if len(pov2)==4 and len(nepov)==3:
        if sum(pov2)/len(pov2) < max(nepov):
            print(k)
            break